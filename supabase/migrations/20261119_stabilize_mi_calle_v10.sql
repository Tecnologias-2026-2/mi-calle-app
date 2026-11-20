-- Fase 0.5 - propuesta V10 de estabilizacion de Mi Calle
-- Version de revision. No ejecutar hasta su aprobacion.

begin;

-- 0. Comprobaciones previas de estructura aprobada.
-- V6 no presupone una base vacia ni crea tablas adicionales.
do $prerequisites$
declare
  v_missing text[];
  v_table text;
  v_trigger_def text;
  v_cols text[];
  v_constraint_def text;
begin
  v_missing := array[]::text[];

  foreach v_table in array array[
    'perfiles',
    'reportes',
    'ubicaciones',
    'fotografias',
    'historial_estados'
  ]
  loop
    if not exists (
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename = v_table
    ) then
      v_missing := array_append(v_missing, 'public.' || v_table);
    end if;
  end loop;

  if v_missing <> array[]::text[] then
    raise exception
      'Faltan tablas aprobadas: %. No se ejecuto la migracion.',
      array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'reportes'
      and name = 'reportes'
  ) then
    raise exception
      'El bucket storage "reportes" no existe. No se ejecuto la migracion.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fotografias'
      and column_name = 'id_reporte'
  ) then
    raise exception
      'Falta public.fotografias.id_reporte.';
  end if;

  if not exists (
    select 1
    from pg_tables
    where schemaname = 'storage'
      and tablename = 'objects'
  ) then
    raise exception
      'Falta storage.objects. No se ejecuto la migracion.';
  end if;

  if not exists (
    select 1
    from pg_tables
    where schemaname = 'auth'
      and tablename = 'users'
  ) then
    raise exception
      'Falta auth.users. No se ejecuto la migracion.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reportes'
      and column_name = 'id_usuario'
  )
  or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reportes'
      and column_name = 'id_ubicacion'
  )
  or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reportes'
      and column_name = 'estado_atencion'
  )
  or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fotografias'
      and column_name = 'storage_path'
  )
  or (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'historial_estados'
      and column_name in (
        'id_administrador',
        'estado',
        'observacion'
      )
  ) <> 3
  then
    raise exception
      'Faltan columnas aprobadas. No se ejecuto la migracion.';
  end if;

  -- Claves primarias requeridas.
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.perfiles'::regclass
      and contype='p'
      and pg_get_constraintdef(oid)='PRIMARY KEY (id_usuario)'
  )
  or not exists (
    select 1 from pg_constraint
    where conrelid='public.reportes'::regclass
      and contype='p'
      and pg_get_constraintdef(oid)='PRIMARY KEY (id_reporte)'
  )
  or not exists (
    select 1 from pg_constraint
    where conrelid='public.ubicaciones'::regclass
      and contype='p'
      and pg_get_constraintdef(oid)='PRIMARY KEY (id_ubicacion)'
  )
  or not exists (
    select 1 from pg_constraint
    where conrelid='public.fotografias'::regclass
      and contype='p'
      and pg_get_constraintdef(oid)='PRIMARY KEY (id_fotografia)'
  )
  or not exists (
    select 1 from pg_constraint
    where conrelid='public.historial_estados'::regclass
      and contype='p'
      and pg_get_constraintdef(oid)='PRIMARY KEY (id_historial)'
  )
  then
    raise exception
      'Las claves primarias no coinciden con la estructura aprobada.';
  end if;

  -- Claves foraneas relevantes: tabla, columna, destino y estado convalidated.
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.perfiles'::regclass
      and c.contype='f'
      and c.convalidated
      and c.conname='perfiles_id_usuario_fkey'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.perfiles'::regclass
           and attname='id_usuario')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'FOREIGN KEY (id_usuario) REFERENCES auth.users(id) ON DELETE CASCADE'
  )
  or not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.reportes'::regclass
      and c.contype='f'
      and c.convalidated
      and c.conname='reportes_id_usuario_fkey'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.reportes'::regclass
           and attname='id_usuario')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'FOREIGN KEY (id_usuario) REFERENCES perfiles(id_usuario)'
  )
  or not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.reportes'::regclass
      and c.contype='f'
      and c.convalidated
      and c.conname='reportes_id_ubicacion_fkey'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.reportes'::regclass
           and attname='id_ubicacion')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'FOREIGN KEY (id_ubicacion) REFERENCES ubicaciones(id_ubicacion)'
  )
  or not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.fotografias'::regclass
      and c.contype='f'
      and c.convalidated
      and c.conname='fotografias_id_reporte_fkey'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.fotografias'::regclass
           and attname='id_reporte')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE'
  )
  or not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.historial_estados'::regclass
      and c.contype='f'
      and c.convalidated
      and c.conname='historial_estados_id_reporte_fkey'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.historial_estados'::regclass
           and attname='id_reporte')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE'
  )
  or not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.historial_estados'::regclass
      and c.contype='f'
      and c.convalidated
      and c.conname='historial_estados_id_administrador_fkey'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.historial_estados'::regclass
           and attname='id_administrador')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'FOREIGN KEY (id_administrador) REFERENCES perfiles(id_usuario) ON DELETE SET NULL'
  )
  then
    raise exception
      'Las claves foraneas no coinciden o no estan validadas.';
  end if;

  -- Tipos completos de las columnas utilizadas por la migracion.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='id_usuario' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='nombre_completo' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='telefono' and data_type='character varying'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='rol' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='fecha_registro' and data_type='timestamp with time zone'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ubicaciones'
      and column_name='direccion_texto' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ubicaciones'
      and column_name='latitud' and data_type='numeric'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ubicaciones'
      and column_name='longitud' and data_type='numeric'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='id_reporte' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='id_usuario' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='id_ubicacion' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='tipo_problema' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='descripcion' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='estado_atencion' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='fecha_creacion' and data_type='timestamp with time zone'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name='updated_at' and data_type='timestamp with time zone'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='fotografias'
      and column_name='id_fotografia' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='fotografias'
      and column_name='id_reporte' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='fotografias'
      and column_name='storage_path' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='fotografias'
      and column_name='fecha_carga' and data_type='timestamp with time zone'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name='id_historial' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name='id_reporte' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name='id_administrador' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name='estado' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name='fecha_cambio' and data_type='timestamp with time zone'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name='observacion' and data_type='text'
  )
  then
    raise exception
      'Los tipos de datos aprobados no coinciden con la estructura real.';
  end if;

  -- CHECK reales requeridos. Se compara la tabla, columnas y definicion exacta,
  -- y se exige que la constraint este validada.
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid='public.perfiles'::regclass
      and c.contype='c'
      and c.convalidated
      and c.conname='perfiles_rol_check'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.perfiles'::regclass
           and attname='rol')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'CHECK ((rol = ANY (ARRAY[''ciudadano''::text, ''administrador''::text])))'
  )
  then
    raise exception
      'CHECK perfiles.rol no coincide con la estructura aprobada o no esta validado.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid='public.reportes'::regclass
      and c.contype='c'
      and c.convalidated
      and c.conname='reportes_estado_atencion_check'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.reportes'::regclass
           and attname='estado_atencion')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'CHECK ((estado_atencion = ANY (ARRAY[''pendiente''::text, ''en_revision''::text, ''en_proceso''::text, ''reparado''::text])))'
  )
  then
    raise exception
      'CHECK reportes.estado_atencion no coincide o no esta validado.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid='public.reportes'::regclass
      and c.contype='c'
      and c.convalidated
      and c.conname='reportes_tipo_problema_check'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.reportes'::regclass
           and attname='tipo_problema')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'CHECK ((tipo_problema = ANY (ARRAY[''bache''::text, ''grieta''::text, ''hundimiento''::text, ''alcantarilla_sin_tapa''::text, ''otro''::text])))'
  )
  then
    raise exception
      'CHECK reportes.tipo_problema no coincide o no esta validado.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid='public.historial_estados'::regclass
      and c.contype='c'
      and c.convalidated
      and c.conname='historial_estados_estado_check'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.historial_estados'::regclass
           and attname='estado')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'CHECK ((estado = ANY (ARRAY[''pendiente''::text, ''en_revision''::text, ''en_proceso''::text, ''reparado''::text])))'
  )
  then
    raise exception
      'CHECK historial_estados.estado no coincide o no esta validado.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fotografias'::regclass
      and contype = 'u'
      and convalidated
      and conname='fotografias_id_reporte_key'
      and conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.fotografias'::regclass
           and attname='id_reporte')
      ]::smallint[]
      and pg_get_constraintdef(oid)='UNIQUE (id_reporte)'
  ) then
    raise exception
      'Falta la restriccion UNIQUE de public.fotografias.id_reporte.';
  end if;

  -- Identificadores UUID relevantes.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='id_usuario' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name in ('id_reporte','id_usuario','id_ubicacion')
      and data_type='uuid'
    having count(*)=3
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ubicaciones'
      and column_name='id_ubicacion' and data_type='uuid'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='fotografias'
      and column_name in ('id_fotografia','id_reporte')
      and data_type='uuid'
    having count(*)=2
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name in ('id_historial','id_reporte','id_administrador')
      and data_type='uuid'
    having count(*)=3
  )
  then
    raise exception
      'Los identificadores UUID no coinciden con la estructura aprobada.';
  end if;

  -- Fechas TIMESTAMPTZ, estados/descripciones TEXT y almacenamiento.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='fecha_registro'
      and data_type='timestamp with time zone'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name in ('tipo_problema','descripcion','estado_atencion')
      and data_type='text'
    having count(*)=3
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reportes'
      and column_name in ('fecha_creacion','updated_at')
      and data_type='timestamp with time zone'
    having count(*)=2
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='fotografias'
      and column_name='storage_path' and data_type='text'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='fotografias'
      and column_name='fecha_carga'
      and data_type='timestamp with time zone'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name in ('estado','observacion')
      and data_type='text'
    having count(*)=2
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='historial_estados'
      and column_name='fecha_cambio'
      and data_type='timestamp with time zone'
  )
  then
    raise exception
      'Los tipos TEXT/TIMESTAMPTZ no coinciden con la estructura aprobada.';
  end if;

  -- Precision/escala y longitudes aprobadas. NUMERIC y VARCHAR sin
  -- precision o longitud declarada no se sustituyen por limites inventados.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='ubicaciones'
      and column_name in ('latitud','longitud')
      and data_type='numeric'
      and numeric_precision is null
      and numeric_scale is null
    having count(*)=2
  )
  or not exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='perfiles'
      and column_name='telefono'
      and data_type='character varying'
      and character_maximum_length is null
  )
  then
    raise exception
      'La precision/escala de coordenadas o la longitud de telefono no coincide con la estructura aprobada.';
  end if;

  -- CHECK exactos de tipo y rangos geograficos.
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid='public.ubicaciones'::regclass
      and c.contype='c'
      and c.convalidated
      and c.conname='ubicaciones_latitud_check'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.ubicaciones'::regclass
           and attname='latitud')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'CHECK (((latitud >= (''-90''::integer)::numeric) AND (latitud <= (90)::numeric)))'
  )
  then
    raise exception
      'CHECK de latitud no coincide o no esta validado.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid='public.ubicaciones'::regclass
      and c.contype='c'
      and c.convalidated
      and c.conname='ubicaciones_longitud_check'
      and c.conkey=ARRAY[
        (select attnum from pg_attribute
         where attrelid='public.ubicaciones'::regclass
           and attname='longitud')
      ]::smallint[]
      and pg_get_constraintdef(c.oid)
        = 'CHECK (((longitud >= (''-180''::integer)::numeric) AND (longitud <= (180)::numeric)))'
  )
  then
    raise exception
      'CHECK de longitud no coincide o no esta validado.';
  end if;
end;
$prerequisites$;

-- 0.1. Los triggers conocidos deben tener las funciones reales esperadas.
do $trigger_check$
declare
  v_count integer;
begin
  -- Auth: on_auth_user_created debe ser AFTER INSERT FOR EACH ROW.
  select count(*)
  into v_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace tn on tn.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  join pg_namespace pn on pn.oid=p.pronamespace
  where not t.tgisinternal
    and tn.nspname='auth'
    and c.relname='users'
    and t.tgname='on_auth_user_created'
    and pn.nspname='public'
    and p.proname='handle_new_auth_user'
    and t.tgtype = 5
    and t.tgenabled in ('O','A');

  if v_count <> 1 then
    raise exception
      'on_auth_user_created no existe, esta deshabilitado o no cumple AFTER INSERT FOR EACH ROW.';
  end if;

  -- Auth: trigger_crear_perfil debe ser AFTER INSERT FOR EACH ROW.
  select count(*)
  into v_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace tn on tn.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  join pg_namespace pn on pn.oid=p.pronamespace
  where not t.tgisinternal
    and tn.nspname='auth'
    and c.relname='users'
    and t.tgname='trigger_crear_perfil'
    and pn.nspname='public'
    and p.proname='crear_perfil_usuario'
    and t.tgtype = 5
    and t.tgenabled in ('O','A');

  if v_count <> 1 then
    raise exception
      'trigger_crear_perfil no existe, esta deshabilitado o no cumple AFTER INSERT FOR EACH ROW.';
  end if;

  -- Public: proteger rol. Si existe, debe ser BEFORE UPDATE FOR EACH ROW.
  select count(*)
  into v_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace tn on tn.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  join pg_namespace pn on pn.oid=p.pronamespace
  where not t.tgisinternal
    and tn.nspname='public'
    and c.relname='perfiles'
    and t.tgname='trigger_proteger_rol_perfil';
  if v_count <> 0 then
    select count(*)
    into v_count
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace tn on tn.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where not t.tgisinternal
      and tn.nspname='public'
      and c.relname='perfiles'
      and t.tgname='trigger_proteger_rol_perfil'
      and pn.nspname='public'
      and p.proname='proteger_rol_perfil'
      and t.tgtype = 19
      and t.tgenabled in ('O','A');
    if v_count <> 1 then
      raise exception 'trigger_proteger_rol_perfil tiene una asociacion o configuracion inesperada.';
    end if;
  end if;

  -- Public: estado inicial. Si existe, debe ser AFTER INSERT FOR EACH ROW.
  select count(*)
  into v_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace tn on tn.oid=c.relnamespace
  where not t.tgisinternal
    and tn.nspname='public'
    and c.relname='reportes'
    and t.tgname='trigger_estado_inicial';
  if v_count <> 0 then
    select count(*)
    into v_count
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace tn on tn.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where not t.tgisinternal
      and tn.nspname='public'
      and c.relname='reportes'
      and t.tgname='trigger_estado_inicial'
      and pn.nspname='public'
      and p.proname='registrar_estado_inicial'
      and t.tgtype = 5
      and t.tgenabled in ('O','A');
    if v_count <> 1 then
      raise exception 'trigger_estado_inicial tiene una asociacion o configuracion inesperada.';
    end if;
  end if;

  -- Public: cambio de estado. Si existe, debe ser BEFORE UPDATE FOR EACH ROW.
  select count(*)
  into v_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace tn on tn.oid=c.relnamespace
  where not t.tgisinternal
    and tn.nspname='public'
    and c.relname='reportes'
    and t.tgname='trigger_cambio_estado';
  if v_count <> 0 then
    select count(*)
    into v_count
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace tn on tn.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where not t.tgisinternal
      and tn.nspname='public'
      and c.relname='reportes'
      and t.tgname='trigger_cambio_estado'
      and pn.nspname='public'
      and p.proname='registrar_cambio_estado'
      and t.tgtype = 19
      and t.tgenabled in ('O','A');
    if v_count <> 1 then
      raise exception 'trigger_cambio_estado tiene una asociacion o configuracion inesperada.';
    end if;
  end if;
end;
$trigger_check$;

-- 0.2. La UNIQUE de ubicacion debe tener exactamente la definicion aprobada.
do $location_unique_check$
declare
  v_def text;
  v_location_attnum smallint;
  r record;
begin
  select attnum
  into v_location_attnum
  from pg_attribute
  where attrelid='public.reportes'::regclass
    and attname='id_ubicacion'
    and not attisdropped;

  select pg_get_constraintdef(c.oid)
  into v_def
  from pg_constraint c
  where c.conrelid='public.reportes'::regclass
    and c.contype='u'
    and c.conname='reportes_id_ubicacion_key';

  if v_def is not null and upper(btrim(v_def)) <> 'UNIQUE (ID_UBICACION)' then
    raise exception
      'reportes_id_ubicacion_key no corresponde exactamente a UNIQUE(id_ubicacion): %. No se eliminara.',
      v_def;
  end if;

  for r in
    select c.conname, c.conkey, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.conrelid='public.reportes'::regclass
      and c.contype='u'
  loop
    if r.conname <> 'reportes_id_ubicacion_key'
       and r.conkey = array[v_location_attnum]::smallint[] then
      raise exception
        'Existe una restriccion UNIQUE incompatible sobre reportes.id_ubicacion: % (%).',
        r.conname, r.definition;
    end if;
  end loop;

  for r in
    select i.indexrelid, i.indisvalid, i.indisready, i.indkey,
           i.indpred, i.indexprs, pg_get_indexdef(i.indexrelid) as definition,
           exists (
             select 1
             from pg_constraint c
             where c.conrelid='public.reportes'::regclass
               and c.conindid=i.indexrelid
           ) as is_constraint_index
    from pg_index i
    where i.indrelid='public.reportes'::regclass
      and i.indisunique
  loop
    -- Se conservan la PK y las UNIQUE legitimas que no impiden reutilizar id_ubicacion.
    if r.is_constraint_index then
      continue;
    end if;

    if r.indisvalid and r.indisready
       and r.indnkeyatts = 1
       and r.indkey[0] = v_location_attnum then
      raise exception
        'Existe un indice UNIQUE incompatible sobre reportes.id_ubicacion: %. Revision manual requerida.',
        r.definition;
    end if;
  end loop;
end;
$location_unique_check$;

-- 0.3. Las vistas existentes deben tener exactamente las columnas aprobadas.
do $view_structure_check$
declare
  v_columns text[];
  v_depend_count integer;
begin
  v_columns := null;
  if to_regclass('public.reportes_publicos') is not null then
    select array_agg(a.attname::text order by a.attnum)
    into v_columns
    from pg_attribute a
    where a.attrelid=to_regclass('public.reportes_publicos')
      and a.attnum > 0
      and not a.attisdropped;

    if v_columns <> array[
         'id_reporte',
         'id_ubicacion',
         'tipo_problema',
         'descripcion',
         'estado_atencion',
         'fecha_creacion',
         'updated_at'
       ]::text[]
    then
      raise exception
        'reportes_publicos tiene una estructura incompatible. Revise la vista manualmente.';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='reportes_publicos'
        and column_name='id_reporte' and data_type='uuid'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='reportes_publicos'
        and column_name='id_ubicacion' and data_type='uuid'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='reportes_publicos'
        and column_name='fecha_creacion' and data_type='timestamp with time zone'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='reportes_publicos'
        and column_name='updated_at' and data_type='timestamp with time zone'
    )
    then
      raise exception
        'Los tipos de columnas de reportes_publicos no coinciden.';
    end if;

    if (
      select count(*)
      from information_schema.columns
      where table_schema='public'
        and table_name='reportes_publicos'
        and (
          (column_name in ('id_reporte','id_ubicacion') and data_type='uuid')
          or (column_name in ('tipo_problema','descripcion','estado_atencion')
              and data_type='text')
          or (column_name in ('fecha_creacion','updated_at')
              and data_type='timestamp with time zone')
        )
    ) <> 7 then
      raise exception
        'reportes_publicos no tiene los siete tipos de columna aprobados.';
    end if;

    select count(*)
    into v_depend_count
    from pg_depend d
    where d.refclassid='pg_class'::regclass
      and d.refobjid=to_regclass('public.reportes_publicos')
      and not (
        d.classid='pg_rewrite'::regclass
        and exists (
          select 1
          from pg_rewrite rw
          where rw.oid=d.objid
            and rw.ev_class=to_regclass('public.reportes_publicos')
        )
      );

    if v_depend_count <> 0 then
      raise exception
        'reportes_publicos tiene dependencias externas. Revise manualmente CREATE OR REPLACE VIEW.';
    end if;
  end if;

  v_columns := null;
  if to_regclass('public.historial_estados_publico') is not null then
    select array_agg(a.attname::text order by a.attnum)
    into v_columns
    from pg_attribute a
    where a.attrelid=to_regclass('public.historial_estados_publico')
      and a.attnum > 0
      and not a.attisdropped;

    if v_columns <> array[
         'id_historial',
         'id_reporte',
         'estado',
         'fecha_cambio'
       ]::text[]
    then
      raise exception
        'historial_estados_publico tiene una estructura incompatible. Revise la vista manualmente.';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='historial_estados_publico'
        and column_name='id_historial' and data_type='uuid'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='historial_estados_publico'
        and column_name='id_reporte' and data_type='uuid'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='historial_estados_publico'
        and column_name='fecha_cambio'
        and data_type='timestamp with time zone'
    )
    then
      raise exception
        'Los tipos de columnas de historial_estados_publico no coinciden.';
    end if;

    if (
      select count(*)
      from information_schema.columns
      where table_schema='public'
        and table_name='historial_estados_publico'
        and (
          (column_name in ('id_historial','id_reporte') and data_type='uuid')
          or (column_name='estado' and data_type='text')
          or (column_name='fecha_cambio'
              and data_type='timestamp with time zone')
        )
    ) <> 4 then
      raise exception
        'historial_estados_publico no tiene los cuatro tipos de columna aprobados.';
    end if;

    select count(*)
    into v_depend_count
    from pg_depend d
    where d.refclassid='pg_class'::regclass
      and d.refobjid=to_regclass('public.historial_estados_publico')
      and not (
        d.classid='pg_rewrite'::regclass
        and exists (
          select 1
          from pg_rewrite rw
          where rw.oid=d.objid
            and rw.ev_class=to_regclass('public.historial_estados_publico')
        )
      );

    if v_depend_count <> 0 then
      raise exception
        'historial_estados_publico tiene dependencias externas. Revise manualmente CREATE OR REPLACE VIEW.';
    end if;
  end if;
end;
$view_structure_check$;

-- 1. El bucket debe existir antes de continuar.
do $bucket_check$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'reportes'
      and name = 'reportes'
  ) then
    raise exception
      'El bucket storage "reportes" no existe. Creelo antes de ejecutar esta migracion.';
  end if;
end;
$bucket_check$;

-- 2. Perfil automatico de Auth.
-- Se inspecciona la definicion completa del legado, pero no se elimina su funcion:
-- pg_depend no permite demostrar por si solo sus efectos funcionales dinamicos.
do $legacy_auth_review$
declare
  v_function oid;
  v_definition text;
begin
  select p.oid into v_function
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='handle_new_auth_user'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_function is null then
    raise exception 'No existe public.handle_new_auth_user(); no se puede consolidar el registro automaticamente.';
  end if;

  select pg_get_functiondef(v_function)
  into v_definition;
  if v_definition is null or btrim(v_definition) = '' then
    raise exception 'No se pudo inspeccionar la definicion completa de handle_new_auth_user().';
  end if;
end;
$legacy_auth_review$;

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

-- handle_new_auth_user() se conserva para revision manual de sus efectos funcionales.

-- handle_new_user() no tiene trigger conocido en el estado auditado.
-- Se mantiene hasta una revision manual de dependencias; no se elimina
-- automaticamente ni se inventa una tabla adicional.

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

-- 3. Proteccion y asignacion de roles.
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
  v_objetivo_rol text;
  v_admin_count integer;
begin
  if v_administrador is null then
    raise exception 'Se requiere una sesion autenticada.';
  end if;

  if p_id_usuario is null then
    raise exception 'El usuario objetivo es obligatorio.';
  end if;

  if p_rol is null then
    raise exception 'El rol es obligatorio.';
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

  -- Serializa todas las reasignaciones de roles durante la transaccion.
  -- Asi dos administradores concurrentes no pueden observar y degradar
  -- simultaneamente al ultimo administrador activo.
  perform pg_advisory_xact_lock(
    hashtextextended('mi_calle:asignacion_rol', 0)
  );

  select rol
  into v_objetivo_rol
  from public.perfiles
  where id_usuario = p_id_usuario;

  if not found then
    raise exception 'Perfil no encontrado.';
  end if;

  if p_rol = 'ciudadano' and v_objetivo_rol = 'administrador' then
    select count(*)
    into v_admin_count
    from public.perfiles
    where rol = 'administrador';

    if v_admin_count <= 1 then
      raise exception 'No se puede degradar al ultimo administrador activo.';
    end if;
  end if;

  update public.perfiles
  set rol = p_rol
  where id_usuario = p_id_usuario;
end;
$function$;

-- 4. Relacion reutilizable entre reportes y ubicaciones.
alter table public.reportes
  drop constraint if exists reportes_id_ubicacion_key;

do $location_unique_postcheck$
declare
  v_location_attnum smallint;
  v_count integer;
begin
  select attnum
  into v_location_attnum
  from pg_attribute
  where attrelid='public.reportes'::regclass
    and attname='id_ubicacion'
    and not attisdropped;

  select count(*) into v_count
  from pg_constraint c
  where c.conrelid='public.reportes'::regclass
    and c.contype='u'
    and c.conkey=array[v_location_attnum]::smallint[];
  if v_count <> 0 then
    raise exception 'Aun existe una UNIQUE sobre public.reportes.id_ubicacion.';
  end if;

  select count(*) into v_count
  from pg_index i
  where i.indrelid='public.reportes'::regclass
    and i.indisunique
    and i.indisvalid
    and i.indisready
    and i.indnkeyatts=1
    and i.indkey[0]=v_location_attnum
    and not exists (
      select 1 from pg_constraint c
      where c.conrelid='public.reportes'::regclass
        and c.conindid=i.indexrelid
    );
  if v_count <> 0 then
    raise exception 'Aun existe un indice UNIQUE no respaldado sobre reportes.id_ubicacion.';
  end if;
end;
$location_unique_postcheck$;

-- 5. Historial automatico.
create or replace function public.registrar_estado_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.estado_atencion is distinct from 'pendiente'
     or new.estado_atencion is null
  then
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

  if p_id_reporte is null then
    raise exception 'El reporte es obligatorio.';
  end if;

  if p_estado is null then
    raise exception 'El estado es obligatorio.';
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

-- 6. Vistas publicas sin DROP CASCADE.
do $view_reportes$
begin
  if not exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'reportes_publicos'
  ) then
    execute $create_view$
      create view public.reportes_publicos
      with (security_invoker = true)
      as
      select
        id_reporte,
        id_ubicacion,
        tipo_problema,
        descripcion,
        estado_atencion,
        fecha_creacion,
        updated_at
      from public.reportes
    $create_view$;
  else
    execute $replace_view$
      create or replace view public.reportes_publicos
      with (security_invoker = true)
      as
      select
        id_reporte,
        id_ubicacion,
        tipo_problema,
        descripcion,
        estado_atencion,
        fecha_creacion,
        updated_at
      from public.reportes
    $replace_view$;
  end if;
end;
$view_reportes$;

do $view_historial$
begin
  if not exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'historial_estados_publico'
  ) then
    execute $create_view$
      create view public.historial_estados_publico
      with (security_invoker = true)
      as
      select
        id_historial,
        id_reporte,
        estado,
        fecha_cambio
      from public.historial_estados
    $create_view$;
  else
    execute $replace_view$
      create or replace view public.historial_estados_publico
      with (security_invoker = true)
      as
      select
        id_historial,
        id_reporte,
        estado,
        fecha_cambio
      from public.historial_estados
    $replace_view$;
  end if;
end;
$view_historial$;

-- 7. RPC transaccional de reporte completo.
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
  v_id_ubicacion uuid;
begin
  if v_usuario is null then
    raise exception 'Se requiere una sesion autenticada.';
  end if;

  if p_id_reporte is null then
    raise exception 'El identificador del reporte es obligatorio.';
  end if;

  if p_tipo_problema is null then
    raise exception 'El tipo de problema es obligatorio.';
  end if;

  if p_latitud is null or p_longitud is null then
    raise exception 'Las coordenadas son obligatorias.';
  end if;

  if p_storage_path is null then
    raise exception 'La ruta de Storage es obligatoria.';
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

  if p_latitud < -90 or p_latitud > 90
     or p_longitud < -180 or p_longitud > 180
  then
    raise exception 'Coordenadas no validas.';
  end if;

  -- La segunda carpeta debe ser UUID y coincidir exactamente con el reporte.
  if split_part(p_storage_path, '/', 2) <> p_id_reporte::text
     or split_part(p_storage_path, '/', 1) <> v_usuario::text
     or split_part(p_storage_path, '/', 2) !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception 'La ruta de Storage no corresponde al usuario y reporte.';
  end if;

  if p_storage_path not in (
    v_usuario::text || '/' || p_id_reporte::text || '/evidencia.jpg',
    v_usuario::text || '/' || p_id_reporte::text || '/evidencia.jpeg',
    v_usuario::text || '/' || p_id_reporte::text || '/evidencia.png',
    v_usuario::text || '/' || p_id_reporte::text || '/evidencia.webp'
  ) then
    raise exception 'El nombre de la fotografia no es permitido.';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'reportes'
      and name = p_storage_path
      and coalesce(metadata->>'mimetype', '') in (
        'image/jpeg',
        'image/png',
        'image/webp'
      )
      and coalesce(metadata->>'size', '') ~ '^[0-9]+$'
      and case
        when coalesce(metadata->>'size', '') ~ '^[0-9]+$'
        then (metadata->>'size')::bigint <= 5242880
        else false
      end
  ) then
    raise exception
      'La fotografia no existe en Storage o no cumple sus metadatos permitidos.';
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
    p_id_reporte,
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
    p_id_reporte,
    p_storage_path
  );

  return p_id_reporte;
end;
$function$;

-- 8. Consulta propia.
create or replace function public.mis_reportes()
returns table (
  id_reporte uuid,
  id_ubicacion uuid,
  tipo_problema text,
  descripcion text,
  estado_atencion text,
  fecha_creacion timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'Se requiere una sesion autenticada.';
  end if;

  return query
  select
    r.id_reporte,
    r.id_ubicacion,
    r.tipo_problema,
    r.descripcion,
    r.estado_atencion,
    r.fecha_creacion,
    r.updated_at
  from public.reportes r
  where r.id_usuario = v_usuario
  order by r.fecha_creacion desc;
end;
$function$;

-- 9. Limpieza total de privilegios por tabla y por columna.
-- Primero se limpia PUBLIC, anon y authenticated, incluyendo columnas.
revoke all on public.perfiles from public, anon, authenticated;
revoke all on public.reportes from public, anon, authenticated;
revoke all on public.ubicaciones from public, anon, authenticated;
revoke all on public.fotografias from public, anon, authenticated;
revoke all on public.historial_estados from public, anon, authenticated;

revoke all (
  id_usuario,
  nombre_completo,
  telefono,
  rol,
  fecha_registro
) on public.perfiles from public, anon, authenticated;

revoke all (
  id_reporte,
  id_usuario,
  id_ubicacion,
  tipo_problema,
  descripcion,
  estado_atencion,
  fecha_creacion,
  updated_at
) on public.reportes from public, anon, authenticated;

revoke all (
  id_ubicacion,
  latitud,
  longitud,
  direccion_texto
) on public.ubicaciones from public, anon, authenticated;

revoke all (
  id_fotografia,
  id_reporte,
  storage_path,
  fecha_carga
) on public.fotografias from public, anon, authenticated;

revoke all (
  id_historial,
  id_reporte,
  id_administrador,
  estado,
  fecha_cambio,
  observacion
) on public.historial_estados from public, anon, authenticated;

-- Concesiones aprobadas.
grant select on public.perfiles to authenticated;
grant update (nombre_completo, telefono) on public.perfiles to authenticated;

grant select (
  id_reporte,
  id_ubicacion,
  tipo_problema,
  descripcion,
  estado_atencion,
  fecha_creacion,
  updated_at
) on public.reportes to anon, authenticated;

grant select on public.ubicaciones to anon, authenticated;

grant select (
  id_fotografia,
  id_reporte,
  storage_path,
  fecha_carga
) on public.fotografias to anon, authenticated;

grant select (
  id_historial,
  id_reporte,
  estado,
  fecha_cambio
) on public.historial_estados to anon, authenticated;

revoke all on public.reportes_publicos from public, anon, authenticated;
revoke all on public.historial_estados_publico from public, anon, authenticated;
grant select on public.reportes_publicos to anon, authenticated;
grant select on public.historial_estados_publico to anon, authenticated;

-- 10. RLS: reemplazo exclusivo de policies conocidas de Mi Calle.
alter table public.perfiles enable row level security;
alter table public.reportes enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.fotografias enable row level security;
alter table public.historial_estados enable row level security;

drop policy if exists "Consultar perfil propio o administrador" on public.perfiles;
drop policy if exists "Consultar perfiles propios o administrativos" on public.perfiles;
drop policy if exists "Actualizar perfil propio" on public.perfiles;
create policy "Consultar perfiles propios o administrativos"
on public.perfiles for select to authenticated
using (
  id_usuario = (select auth.uid())
  or public.es_administrador()
);
create policy "Actualizar perfil propio"
on public.perfiles for update to authenticated
using (id_usuario = (select auth.uid()))
with check (id_usuario = (select auth.uid()));

drop policy if exists "Consultar reportes publicos" on public.reportes;
drop policy if exists "Crear reportes propios" on public.reportes;
drop policy if exists "Administradores actualizan reportes" on public.reportes;
create policy "Consultar reportes publicos"
on public.reportes for select to anon, authenticated
using (true);

drop policy if exists "Consultar ubicaciones publicas" on public.ubicaciones;
drop policy if exists "Usuarios autenticados crean ubicaciones" on public.ubicaciones;
create policy "Consultar ubicaciones publicas"
on public.ubicaciones for select to anon, authenticated
using (true);

drop policy if exists "Consultar fotografias publicas" on public.fotografias;
drop policy if exists "Ciudadanos crean fotografias de reportes propios" on public.fotografias;
create policy "Consultar fotografias publicas"
on public.fotografias for select to anon, authenticated
using (true);

drop policy if exists "Consultar historial publico" on public.historial_estados;
create policy "Consultar historial publico"
on public.historial_estados for select to anon, authenticated
using (true);

-- 11. Privilegios de funciones.
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

revoke execute on function public.mis_reportes() from public, anon, service_role;
grant execute on function public.mis_reportes() to authenticated;

-- 11.1. Verificacion posterior de funciones SECURITY DEFINER.
do $security_definer_check$
declare
  v_name text;
  v_count integer;
  v_oid oid;
begin
  foreach v_name in array array[
    'crear_perfil_usuario',
    'es_administrador',
    'proteger_rol_perfil',
    'asignar_rol_perfil',
    'registrar_estado_inicial',
    'registrar_cambio_estado',
    'actualizar_estado_reporte',
    'crear_reporte_completo',
    'mis_reportes'
  ]
  loop
    select count(*)
    into v_count
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=v_name
      and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig = array['search_path=""']::text[];

    if v_count <> 1 then
      raise exception
        'La funcion SECURITY DEFINER % no tiene exactamente search_path="" o no existe.',
        v_name;
    end if;

    select p.oid
    into v_oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=v_name;

    if v_oid is null then
      raise exception 'No existe la funcion public.%', v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'crear_perfil_usuario',
    'proteger_rol_perfil',
    'registrar_estado_inicial',
    'registrar_cambio_estado'
  ]
  loop
    select p.oid
    into v_oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=v_name;

    if has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
    then
      raise exception
        'La funcion interna % es ejecutable por anon o authenticated.',
        v_name;
    end if;
  end loop;

  foreach v_name in array array[
    'es_administrador',
    'asignar_rol_perfil',
    'actualizar_estado_reporte',
    'crear_reporte_completo',
    'mis_reportes'
  ]
  loop
    select p.oid
    into v_oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=v_name;

    if not has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or has_function_privilege('anon', v_oid, 'EXECUTE')
    then
      raise exception
        'La RPC % no tiene la matriz EXECUTE aprobada.',
        v_name;
    end if;

  end loop;
end;
$security_definer_check$;

-- 12. Configuracion del bucket.
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

-- 13. Storage: reemplazo exclusivo de las dos policies reservadas.
drop policy if exists "Lectura publica de reportes" on storage.objects;
create policy "Lectura publica de reportes"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'reportes');

drop policy if exists "Subida autenticada en ruta de reporte" on storage.objects;
create policy "Subida autenticada en ruta de reporte"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'reportes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and array_length(storage.foldername(name), 1) = 2
  and name in (
    (select auth.uid())::text
      || '/' || (storage.foldername(name))[2] || '/evidencia.jpg',
    (select auth.uid())::text
      || '/' || (storage.foldername(name))[2] || '/evidencia.jpeg',
    (select auth.uid())::text
      || '/' || (storage.foldername(name))[2] || '/evidencia.png',
    (select auth.uid())::text
      || '/' || (storage.foldername(name))[2] || '/evidencia.webp'
  )
);

commit;
