-- Fase 0.1 - estabilizacion corregida de Mi Calle
-- Version de revision; no ejecutar hasta aprobarla.

begin;

-- ============================================================
-- 1. Perfil automatico y funcion de seguridad
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trigger_crear_perfil on auth.users;

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

create trigger trigger_crear_perfil
after insert on auth.users
for each row
execute function public.crear_perfil_usuario();

drop function if exists public.handle_new_auth_user();
drop function if exists public.handle_new_user();

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

-- ============================================================
-- 2. Proteccion explicita de roles
-- ============================================================

create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'No se puede modificar un perfil sin una sesion autenticada.';
  end if;

  if old.rol is distinct from new.rol then
    if not exists (
      select 1
      from public.perfiles
      where id_usuario = v_usuario
        and rol = 'administrador'
    ) then
      raise exception 'Solo un administrador puede cambiar roles.';
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

create or replace function public.asignar_rol_perfil(
  p_id_usuario uuid,
  p_rol text
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
    raise exception 'Se requiere una sesion autenticada.';
  end if;

  if not exists (
    select 1
    from public.perfiles
    where id_usuario = v_administrador
      and rol = 'administrador'
  ) then
    raise exception 'Solo un administrador puede asignar roles.';
  end if;

  if p_rol not in ('ciudadano', 'administrador') then
    raise exception 'Rol no valido.';
  end if;

  update public.perfiles
  set rol = p_rol
  where id_usuario = p_id_usuario;

  if not found then
    raise exception 'Perfil no encontrado.';
  end if;
end;
$function$;

-- ============================================================
-- 3. Relacion reutilizable entre reportes y ubicaciones
-- ============================================================

alter table public.reportes
  drop constraint if exists reportes_id_ubicacion_key;

-- ============================================================
-- 4. Historial de estados
-- ============================================================

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
  v_administrador uuid := (select auth.uid());
  v_observacion text;
begin
  if old.estado_atencion is distinct from new.estado_atencion then
    if v_administrador is null then
      raise exception 'El cambio de estado requiere una sesion autenticada.';
    end if;

    if not exists (
      select 1
      from public.perfiles
      where id_usuario = v_administrador
        and rol = 'administrador'
    ) then
      raise exception 'El cambio de estado debe realizarlo un administrador.';
    end if;

    v_observacion := nullif(
      btrim(coalesce(current_setting('app.mi_calle_observacion', true), '')),
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
    raise exception 'Se requiere una sesion autenticada.';
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
    raise exception 'Estado de atencion no valido.';
  end if;

  perform set_config(
    'app.mi_calle_observacion',
    coalesce(p_observacion, ''),
    true
  );

  update public.reportes
  set estado_atencion = p_estado
  where id_reporte = p_id_reporte;

  if not found then
    raise exception 'Reporte no encontrado.';
  end if;
end;
$function$;

-- ============================================================
-- 5. RPC transaccional para crear un reporte completo
-- ============================================================

create or replace function public.crear_reporte_completo(
  p_id_reporte uuid,
  p_tipo_problema text,
  p_descripcion text,
  p_latitud numeric,
  p_longitud numeric,
  p_direccion_texto text,
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario uuid := (select auth.uid());
  v_id_reporte uuid := p_id_reporte;
  v_id_ubicacion uuid;
  v_id_fotografia uuid;
begin
  if v_usuario is null then
    raise exception 'Se requiere una sesion autenticada.';
  end if;

  if v_id_reporte is null then
    raise exception 'El identificador del reporte es obligatorio.';
  end if;

  if not exists (
    select 1
    from public.perfiles
    where id_usuario = v_usuario
  ) then
    raise exception 'El perfil autenticado no existe.';
  end if;

  if p_tipo_problema not in (
    'bache',
    'grieta',
    'hundimiento',
    'alcantarilla_sin_tapa',
    'otro'
  ) then
    raise exception 'Tipo de problema no valido.';
  end if;

  if p_latitud is null
     or p_latitud < -90
     or p_latitud > 90
     or p_longitud is null
     or p_longitud < -180
     or p_longitud > 180
  then
    raise exception 'Coordenadas no validas.';
  end if;

  if p_storage_path is null
     or lower(p_storage_path) !~ (
       '^' || v_usuario::text || '/'
       || v_id_reporte::text
       || '/[^/]+\.(jpg|jpeg|png|webp)$'
     )
  then
    raise exception 'La ruta de Storage no corresponde al usuario y reporte.';
  end if;

  insert into public.ubicaciones (
    latitud,
    longitud,
    direccion_texto
  )
  values (
    p_latitud,
    p_longitud,
    nullif(btrim(coalesce(p_direccion_texto, '')), '')
  )
  returning id_ubicacion into v_id_ubicacion;

  insert into public.reportes (
    id_reporte,
    id_usuario,
    id_ubicacion,
    tipo_problema,
    descripcion,
    estado_atencion
  )
  values (
    v_id_reporte,
    v_usuario,
    v_id_ubicacion,
    p_tipo_problema,
    nullif(btrim(coalesce(p_descripcion, '')), ''),
    'pendiente'
  );

  insert into public.fotografias (
    id_reporte,
    storage_path
  )
  values (
    v_id_reporte,
    p_storage_path
  )
  returning id_fotografia into v_id_fotografia;

  return v_id_reporte;
end;
$function$;

-- ============================================================
-- 6. Privilegios de funciones
-- ============================================================

revoke execute on function public.crear_perfil_usuario() from public, anon, authenticated, service_role;
revoke execute on function public.proteger_rol_perfil() from public, anon, authenticated, service_role;
revoke execute on function public.registrar_estado_inicial() from public, anon, authenticated, service_role;
revoke execute on function public.registrar_cambio_estado() from public, anon, authenticated, service_role;

revoke execute on function public.es_administrador() from public, anon, service_role;
grant execute on function public.es_administrador() to authenticated;

revoke execute on function public.actualizar_estado_reporte(uuid, text, text) from public, anon, service_role;
grant execute on function public.actualizar_estado_reporte(uuid, text, text) to authenticated;

revoke execute on function public.asignar_rol_perfil(uuid, text) from public, anon, service_role;
grant execute on function public.asignar_rol_perfil(uuid, text) to authenticated;

revoke execute on function public.crear_reporte_completo(uuid, text, text, numeric, numeric, text, text) from public, anon, service_role;
grant execute on function public.crear_reporte_completo(uuid, text, text, numeric, numeric, text, text) to authenticated;

-- ============================================================
-- 7. Eliminar politicas RLS antiguas y recrear politicas
-- ============================================================

do $policy_cleanup$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'perfiles',
        'reportes',
        'ubicaciones',
        'fotografias',
        'historial_estados'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      r.policyname,
      r.tablename
    );
  end loop;
end;
$policy_cleanup$;

alter table public.perfiles enable row level security;
alter table public.reportes enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.fotografias enable row level security;
alter table public.historial_estados enable row level security;

create policy "Consultar perfiles propios o administrativos"
on public.perfiles
for select
to authenticated
using (
  id_usuario = (select auth.uid())
  or public.es_administrador()
);

create policy "Actualizar perfil propio"
on public.perfiles
for update
to authenticated
using (id_usuario = (select auth.uid()))
with check (id_usuario = (select auth.uid()));

create policy "Consultar reportes publicos"
on public.reportes
for select
to anon, authenticated
using (true);

create policy "Consultar ubicaciones publicas"
on public.ubicaciones
for select
to anon, authenticated
using (true);

create policy "Consultar fotografias publicas"
on public.fotografias
for select
to anon, authenticated
using (true);

create policy "Consultar historial publico"
on public.historial_estados
for select
to anon, authenticated
using (true);

-- ============================================================
-- 8. Privilegios de tabla y columna
-- ============================================================

revoke all on public.perfiles from anon, authenticated;
revoke all on public.reportes from anon, authenticated;
revoke all on public.ubicaciones from anon, authenticated;
revoke all on public.fotografias from anon, authenticated;
revoke all on public.historial_estados from anon, authenticated;

grant select on public.perfiles to authenticated;
grant update (nombre_completo, telefono) on public.perfiles to authenticated;

grant select on public.reportes to anon, authenticated;
grant select on public.ubicaciones to anon, authenticated;
grant select on public.fotografias to anon, authenticated;
grant select on public.historial_estados to anon, authenticated;

-- No se conceden INSERT, UPDATE ni DELETE en las tablas operativas a
-- anon/authenticated. Las operaciones se realizan por RPC SECURITY DEFINER
-- o por los triggers internos.

-- ============================================================
-- 9. Storage: bucket y politicas
-- ============================================================

update storage.buckets
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ]::text[]
where id = 'reportes';

do $storage_policy_cleanup$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      r.policyname
    );
  end loop;
end;
$storage_policy_cleanup$;

create policy "Lectura publica de reportes"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'reportes');

create policy "Subida autenticada en ruta de reporte"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'reportes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 2
  and coalesce(
    lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp'),
    false
  )
);

commit;
