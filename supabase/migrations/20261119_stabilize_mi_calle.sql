-- Fase 0 - estabilización de Mi Calle
-- Revisar antes de ejecutar. Esta migración no elimina tablas ni usuarios.

begin;

-- 1. Perfil automático de Auth
drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.perfiles (
    id_usuario,
    nombre_completo,
    rol
  )
  values (
    new.id,
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nombre_completo', '')), ''),
      'Usuario'
    ),
    'ciudadano'
  )
  on conflict (id_usuario) do nothing;

  return new;
end;
$function$;

drop trigger if exists trigger_crear_perfil on auth.users;
create trigger trigger_crear_perfil
after insert on auth.users
for each row
execute function public.crear_perfil_usuario();

-- Las funciones antiguas intentaban crear public.usuarios y quedan sin uso.
drop function if exists public.handle_new_auth_user();
drop function if exists public.handle_new_user();

-- Impide cambios del rol desde el flujo ciudadano, aunque se permita acceso futuro
-- a perfiles por administradores mediante una operación privilegiada explícita.
create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.rol is distinct from new.rol then
    if not exists (
      select 1
      from public.perfiles
      where id_usuario = (select auth.uid())
        and rol = 'administrador'
    )
    and (select auth.uid()) is not null then
      raise exception 'Solo un administrador puede cambiar el rol.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trigger_proteger_rol_perfil on public.perfiles;
create trigger trigger_proteger_rol_perfil
before update on public.perfiles
for each row
execute function public.proteger_rol_perfil();

-- 2. Relación entre reportes y ubicaciones
-- Conserva la FK y permite reutilizar una ubicación por varios reportes.
alter table public.reportes
  drop constraint if exists reportes_id_ubicacion_key;

-- 3. Historial automático
create or replace function public.registrar_estado_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.estado_atencion <> 'pendiente' then
    raise exception 'El estado inicial de un reporte debe ser pendiente.';
  end if;

  insert into public.historial_estados (
    id_reporte,
    estado,
    id_administrador,
    observacion
  )
  values (
    new.id_reporte,
    'pendiente',
    null,
    null
  );

  return new;
end;
$function$;

create or replace function public.registrar_cambio_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_administrador uuid;
  v_observacion text;
begin
  if old.estado_atencion is distinct from new.estado_atencion then
    v_administrador := nullif(
      current_setting('app.id_administrador', true),
      ''
    )::uuid;

    if v_administrador is null then
      v_administrador := (select auth.uid());
    end if;

    if v_administrador is not null then
      if not exists (
        select 1
        from public.perfiles
        where id_usuario = v_administrador
          and rol = 'administrador'
      ) then
        raise exception 'El cambio de estado debe identificar a un administrador.';
      end if;
    end if;

    v_observacion := nullif(
      btrim(coalesce(current_setting('app.observacion', true), '')),
      ''
    );

    insert into public.historial_estados (
      id_reporte,
      id_administrador,
      estado,
      observacion
    )
    values (
      new.id_reporte,
      v_administrador,
      new.estado_atencion,
      v_observacion
    );

    new.updated_at = now();
  end if;

  return new;
end;
$function$;

-- Reinstala los triggers con las funciones estabilizadas.
drop trigger if exists trigger_estado_inicial on public.reportes;
create trigger trigger_estado_inicial
after insert on public.reportes
for each row
execute function public.registrar_estado_inicial();

drop trigger if exists trigger_cambio_estado on public.reportes;
create trigger trigger_cambio_estado
before update on public.reportes
for each row
execute function public.registrar_cambio_estado();

-- Operación administrativa controlada para registrar observación y administrador.
create or replace function public.actualizar_estado_reporte(
  p_id_reporte uuid,
  p_estado text,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_administrador uuid := (select auth.uid());
begin
  if v_administrador is null then
    raise exception 'Se requiere una sesión autenticada.';
  end if;

  if not exists (
    select 1
    from public.perfiles
    where id_usuario = v_administrador
      and rol = 'administrador'
  ) then
    raise exception 'Solo un administrador puede actualizar reportes.';
  end if;

  if p_estado not in ('pendiente', 'en_revision', 'en_proceso', 'reparado') then
    raise exception 'Estado de atención no válido.';
  end if;

  perform set_config('app.id_administrador', v_administrador::text, true);
  perform set_config('app.observacion', coalesce(p_observacion, ''), true);

  update public.reportes
  set estado_atencion = p_estado
  where id_reporte = p_id_reporte;

  if not found then
    raise exception 'Reporte no encontrado.';
  end if;
end;
$function$;

-- 4. Función de autorización
create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.perfiles
    where id_usuario = (select auth.uid())
      and rol = 'administrador'
  );
$function$;

-- Privilegios mínimos de ejecución. Los triggers no requieren EXECUTE desde API.
revoke execute on function public.crear_perfil_usuario() from public, anon, authenticated;
revoke execute on function public.registrar_estado_inicial() from public, anon, authenticated;
revoke execute on function public.registrar_cambio_estado() from public, anon, authenticated;
revoke execute on function public.proteger_rol_perfil() from public, anon, authenticated;
revoke execute on function public.actualizar_estado_reporte(uuid, text, text) from public, anon;
revoke execute on function public.es_administrador() from public, anon;

grant execute on function public.actualizar_estado_reporte(uuid, text, text) to authenticated, service_role;
grant execute on function public.es_administrador() to authenticated, service_role;
grant execute on function public.crear_perfil_usuario() to service_role;
grant execute on function public.registrar_estado_inicial() to service_role;
grant execute on function public.registrar_cambio_estado() to service_role;
grant execute on function public.proteger_rol_perfil() to service_role;

-- 5. RLS de perfiles
alter table public.perfiles enable row level security;

drop policy if exists "Consultar perfil propio o administrador" on public.perfiles;
drop policy if exists "Consultar perfiles propios o administrativos" on public.perfiles;
create policy "Consultar perfiles propios o administrativos"
on public.perfiles
for select
to authenticated
using (
  id_usuario = (select auth.uid())
  or public.es_administrador()
);

drop policy if exists "Actualizar perfil propio" on public.perfiles;
create policy "Actualizar perfil propio"
on public.perfiles
for update
to authenticated
using (id_usuario = (select auth.uid()))
with check (id_usuario = (select auth.uid()));

revoke insert, delete on public.perfiles from anon, authenticated;
revoke update on public.perfiles from anon, authenticated;
grant update (nombre_completo, telefono) on public.perfiles to authenticated;

-- 6. RLS de reportes
alter table public.reportes enable row level security;

drop policy if exists "Consultar reportes publicos" on public.reportes;
create policy "Consultar reportes publicos"
on public.reportes
for select
to anon, authenticated
using (true);

drop policy if exists "Crear reportes propios" on public.reportes;
create policy "Crear reportes propios"
on public.reportes
for insert
to authenticated
with check (
  id_usuario = (select auth.uid())
  and estado_atencion = 'pendiente'
);

drop policy if exists "Administradores actualizan reportes" on public.reportes;
create policy "Administradores actualizan reportes"
on public.reportes
for update
to authenticated
using (public.es_administrador())
with check (public.es_administrador());

revoke delete on public.reportes from anon, authenticated;
revoke update on public.reportes from anon, authenticated;
grant update (estado_atencion) on public.reportes to authenticated;

-- 7. RLS de ubicaciones
alter table public.ubicaciones enable row level security;

drop policy if exists "Consultar ubicaciones publicas" on public.ubicaciones;
create policy "Consultar ubicaciones publicas"
on public.ubicaciones
for select
to anon, authenticated
using (true);

drop policy if exists "Usuarios autenticados crean ubicaciones" on public.ubicaciones;
create policy "Usuarios autenticados crean ubicaciones"
on public.ubicaciones
for insert
to authenticated
with check (true);

revoke update, delete on public.ubicaciones from anon, authenticated;

-- 8. RLS de fotografías
alter table public.fotografias enable row level security;

drop policy if exists "Consultar fotografias publicas" on public.fotografias;
create policy "Consultar fotografias publicas"
on public.fotografias
for select
to anon, authenticated
using (true);

drop policy if exists "Ciudadanos crean fotografias de reportes propios" on public.fotografias;
create policy "Ciudadanos crean fotografias de reportes propios"
on public.fotografias
for insert
to authenticated
with check (
  exists (
    select 1
    from public.reportes r
    where r.id_reporte = fotografias.id_reporte
      and r.id_usuario = (select auth.uid())
  )
);

revoke update, delete on public.fotografias from anon, authenticated;

-- 9. RLS de historial
alter table public.historial_estados enable row level security;

drop policy if exists "Consultar historial publico" on public.historial_estados;
create policy "Consultar historial publico"
on public.historial_estados
for select
to anon, authenticated
using (true);

revoke insert, update, delete on public.historial_estados from anon, authenticated;

-- 10. Supabase Storage
update storage.buckets
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
where id = 'reportes';

drop policy if exists "Lectura publica de reportes" on storage.objects;
create policy "Lectura publica de reportes"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'reportes');

drop policy if exists "Subida autenticada en carpeta propia" on storage.objects;
create policy "Subida autenticada en carpeta propia"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'reportes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);

drop policy if exists "Sin sobrescritura ni reemplazo" on storage.objects;
drop policy if exists "Sin actualizacion de evidencia" on storage.objects;
create policy "Sin actualizacion de evidencia"
on storage.objects
for update
to authenticated
using (false)
with check (false);

drop policy if exists "Eliminacion de evidencia propia" on storage.objects;
create policy "Eliminacion de evidencia propia"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'reportes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
