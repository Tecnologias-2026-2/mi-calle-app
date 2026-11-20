-- Mi Calle V11.1 - propuesta de estabilizacion para revision humana.
-- No ejecutar hasta aprobacion. Esta migracion es una sola transaccion.
-- Agrega una tabla tecnica de tombstones para serializar asociacion y limpieza.
-- No borra filas de negocio ni objetos de Storage durante la migracion.
--
-- Decision aceptada para la propuesta: la subida ocurre antes de la RPC.
-- La policy valida usuario y ruta; la RPC verifica el objeto y crea la
-- relacion con el reporte autenticado. La policy no puede comprobar la
-- propiedad de un reporte que todavia no existe.

BEGIN;

-- Bloqueo de ejecuciones concurrentes de esta migracion.
SELECT pg_advisory_xact_lock(hashtextextended('mi_calle:migration:v11_1', 0));

-- Todas las precondiciones se comprueban antes del primer cambio.
-- Un estado parcial o no reconocido detiene y revierte la transaccion.
DO $preflight$
DECLARE
  v_count integer;
  v_mismatch integer;
  v_location_attnum smallint;
  r record;
BEGIN
  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'V11.1 requiere session_user y current_user postgres; no se modifico ningun objeto.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('postgres'::text), ('anon'::text), ('authenticated'::text),
      ('service_role'::text), ('supabase_storage_admin'::text)
    ) AS expected(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_roles pr WHERE pr.rolname = expected.role_name
    )
  ) THEN
    RAISE EXCEPTION 'Falta un rol requerido en el entorno Supabase.';
  END IF;

  IF to_regclass('public.perfiles') IS NULL
     OR to_regclass('public.reportes') IS NULL
     OR to_regclass('public.ubicaciones') IS NULL
     OR to_regclass('public.fotografias') IS NULL
     OR to_regclass('public.historial_estados') IS NULL
     OR to_regclass('auth.users') IS NULL
     OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION 'Falta una tabla aprobada, auth.users o storage.objects.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('perfiles'::text, 'postgres'::text),
      ('reportes'::text, 'postgres'::text),
      ('ubicaciones'::text, 'postgres'::text),
      ('fotografias'::text, 'postgres'::text),
      ('historial_estados'::text, 'postgres'::text)
    ) AS expected(table_name, owner_name)
    JOIN pg_class c ON c.oid = to_regclass('public.' || expected.table_name)
    WHERE pg_get_userbyid(c.relowner) IS DISTINCT FROM expected.owner_name
  ) THEN
    RAISE EXCEPTION 'La propiedad de una tabla publica no coincide con el estado auditado.';
  END IF;

  IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'storage.objects'::regclass))
       IS DISTINCT FROM 'supabase_storage_admin'
  THEN
    RAISE EXCEPTION 'La propiedad de storage.objects cambio; requiere revision manual.';
  END IF;

  -- Compara el conjunto de columnas y sus tipos auditados.
  WITH expected(table_name, column_name, type_name, alt_type_name) AS (
    VALUES
      ('perfiles','id_usuario','uuid','uuid'),
      ('perfiles','nombre_completo','text','text'),
      ('perfiles','telefono','character varying','character varying(20)'),
      ('perfiles','rol','text','text'),
      ('perfiles','fecha_registro','timestamp with time zone','timestamp with time zone'),
      ('reportes','id_reporte','uuid','uuid'),
      ('reportes','id_usuario','uuid','uuid'),
      ('reportes','id_ubicacion','uuid','uuid'),
      ('reportes','tipo_problema','text','text'),
      ('reportes','descripcion','text','text'),
      ('reportes','estado_atencion','text','text'),
      ('reportes','fecha_creacion','timestamp with time zone','timestamp with time zone'),
      ('reportes','updated_at','timestamp with time zone','timestamp with time zone'),
      ('ubicaciones','id_ubicacion','uuid','uuid'),
      ('ubicaciones','latitud','numeric','numeric(10,7)'),
      ('ubicaciones','longitud','numeric','numeric(10,7)'),
      ('ubicaciones','direccion_texto','text','text'),
      ('fotografias','id_fotografia','uuid','uuid'),
      ('fotografias','id_reporte','uuid','uuid'),
      ('fotografias','storage_path','text','text'),
      ('fotografias','fecha_carga','timestamp with time zone','timestamp with time zone'),
      ('historial_estados','id_historial','uuid','uuid'),
      ('historial_estados','id_reporte','uuid','uuid'),
      ('historial_estados','id_administrador','uuid','uuid'),
      ('historial_estados','estado','text','text'),
      ('historial_estados','fecha_cambio','timestamp with time zone','timestamp with time zone'),
      ('historial_estados','observacion','text','text')
  ),
  actual AS (
    SELECT c.relname AS table_name,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS type_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relname IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')
      AND a.attnum > 0
      AND NOT a.attisdropped
  )
  SELECT count(*) INTO v_mismatch
  FROM expected e
  LEFT JOIN actual a USING (table_name, column_name)
  WHERE a.column_name IS NULL
     OR (a.type_name IS DISTINCT FROM e.type_name AND a.type_name IS DISTINCT FROM e.alt_type_name);

  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'Columnas o tipos no coinciden con el esquema auditado.';
  END IF;

  IF (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.perfiles'::regclass AND attnum > 0 AND NOT attisdropped) <> 5
     OR (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.reportes'::regclass AND attnum > 0 AND NOT attisdropped) <> 8
     OR (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.ubicaciones'::regclass AND attnum > 0 AND NOT attisdropped) <> 4
     OR (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.fotografias'::regclass AND attnum > 0 AND NOT attisdropped) <> 4
     OR (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.historial_estados'::regclass AND attnum > 0 AND NOT attisdropped) <> 6
  THEN
    RAISE EXCEPTION 'Una tabla tiene columnas adicionales o faltantes; revision manual requerida.';
  END IF;

  -- Constraints aprobadas: nombre, tipo, definicion y convalidated.
  WITH expected(table_name, constraint_name, constraint_type, definition) AS (
    VALUES
      ('perfiles','perfiles_pkey','p','PRIMARY KEY (id_usuario)'),
      ('perfiles','perfiles_id_usuario_fkey','f',
       'FOREIGN KEY (id_usuario) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('perfiles','perfiles_rol_check','c',
       'CHECK ((rol = ANY (ARRAY[''ciudadano''::text, ''administrador''::text])))'),
      ('reportes','reportes_pkey','p','PRIMARY KEY (id_reporte)'),
      ('reportes','reportes_id_usuario_fkey','f',
       'FOREIGN KEY (id_usuario) REFERENCES perfiles(id_usuario)'),
      ('reportes','reportes_id_ubicacion_fkey','f',
       'FOREIGN KEY (id_ubicacion) REFERENCES ubicaciones(id_ubicacion)'),
      ('reportes','reportes_id_ubicacion_key','u','UNIQUE (id_ubicacion)'),
      ('reportes','reportes_estado_atencion_check','c',
       'CHECK ((estado_atencion = ANY (ARRAY[''pendiente''::text, ''en_revision''::text, ''en_proceso''::text, ''reparado''::text])))'),
      ('reportes','reportes_tipo_problema_check','c',
       'CHECK ((tipo_problema = ANY (ARRAY[''bache''::text, ''grieta''::text, ''hundimiento''::text, ''alcantarilla_sin_tapa''::text, ''otro''::text])))'),
      ('ubicaciones','ubicaciones_pkey','p','PRIMARY KEY (id_ubicacion)'),
      ('ubicaciones','ubicaciones_latitud_check','c',
       'CHECK (((latitud >= (''-90''::integer)::numeric) AND (latitud <= (90)::numeric)))'),
      ('ubicaciones','ubicaciones_longitud_check','c',
       'CHECK (((longitud >= (''-180''::integer)::numeric) AND (longitud <= (180)::numeric)))'),
      ('fotografias','fotografias_pkey','p','PRIMARY KEY (id_fotografia)'),
      ('fotografias','fotografias_id_reporte_fkey','f',
       'FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE'),
      ('fotografias','fotografias_id_reporte_key','u','UNIQUE (id_reporte)'),
      ('historial_estados','historial_estados_pkey','p','PRIMARY KEY (id_historial)'),
      ('historial_estados','historial_estados_id_reporte_fkey','f',
       'FOREIGN KEY (id_reporte) REFERENCES reportes(id_reporte) ON DELETE CASCADE'),
      ('historial_estados','historial_estados_id_administrador_fkey','f',
       'FOREIGN KEY (id_administrador) REFERENCES perfiles(id_usuario) ON DELETE SET NULL'),
      ('historial_estados','historial_estados_estado_check','c',
       'CHECK ((estado = ANY (ARRAY[''pendiente''::text, ''en_revision''::text, ''en_proceso''::text, ''reparado''::text])))')
  )
  SELECT count(*) INTO v_mismatch
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.' || e.table_name)
      AND c.conname = e.constraint_name
      AND c.contype = e.constraint_type
      AND c.convalidated
      AND pg_get_constraintdef(c.oid) = e.definition
  );

  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'Una PK, FK, CHECK o UNIQUE requerida no coincide exactamente o no esta validada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('perfiles'::text, 3),
      ('reportes'::text, 6),
      ('ubicaciones'::text, 3),
      ('fotografias'::text, 3),
      ('historial_estados'::text, 4)
    ) AS expected(table_name, constraint_count)
    WHERE (
      SELECT count(*)
      FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.' || expected.table_name)
    ) <> expected.constraint_count
  ) THEN
    RAISE EXCEPTION 'El inventario de constraints contiene objetos adicionales o faltantes.';
  END IF;

  SELECT attnum INTO v_location_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.reportes'::regclass
    AND attname = 'id_ubicacion'
    AND NOT attisdropped;

  IF v_location_attnum IS NULL THEN
    RAISE EXCEPTION 'No se encontro reportes.id_ubicacion.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_index i ON i.indexrelid = c.conindid
    WHERE c.conrelid = 'public.reportes'::regclass
      AND c.conname = 'reportes_id_ubicacion_key'
      AND c.contype = 'u'
      AND c.conkey = ARRAY[v_location_attnum]::smallint[]
      AND c.convalidated
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indnkeyatts = 1
      AND i.indkey[0] = v_location_attnum
  ) THEN
    RAISE EXCEPTION 'UNIQUE(id_ubicacion) no tiene un indice unico valido y listo.';
  END IF;

  -- No se quitan indices/constraints desconocidos. Un UNIQUE compuesto
  -- con mas de una columna clave no impide reutilizar por si solo la ubicacion.
  FOR r IN
    SELECT i.indexrelid,
           i.indnkeyatts,
           i.indkey,
           i.indpred,
           i.indexprs,
           i.indisvalid,
           i.indisready,
           pg_get_indexdef(i.indexrelid) AS definition,
           EXISTS (
             SELECT 1 FROM pg_constraint c
             WHERE c.conrelid = 'public.reportes'::regclass
               AND c.conindid = i.indexrelid
               AND c.conname = 'reportes_id_ubicacion_key'
           ) AS expected_location_constraint_index
    FROM pg_index i
    WHERE i.indrelid = 'public.reportes'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
  LOOP
    IF r.expected_location_constraint_index THEN
      CONTINUE;
    END IF;

    IF r.indnkeyatts = 1 AND r.indkey[0] = v_location_attnum THEN
      RAISE EXCEPTION 'Indice UNIQUE adicional podria impedir reutilizar ubicaciones: %',
        r.definition;
    END IF;

    IF r.indexprs IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM pg_depend d
         WHERE d.classid = 'pg_class'::regclass
           AND d.objid = r.indexrelid
           AND d.refclassid = 'pg_class'::regclass
           AND d.refobjid = 'public.reportes'::regclass
           AND d.refobjsubid = v_location_attnum
       )
    THEN
      RAISE EXCEPTION 'Indice UNIQUE por expresion depende de id_ubicacion: %',
        r.definition;
    END IF;
  END LOOP;

  -- Estado inicial conocido: las vistas V11 aun no existen.
  IF to_regclass('public.reportes_publicos') IS NOT NULL
     OR to_regclass('public.historial_estados_publico') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Existe una vista reservada; revisar su definicion y dependencias antes de continuar.';
  END IF;

  IF to_regclass('public.usuarios') IS NOT NULL THEN
    RAISE EXCEPTION 'public.usuarios existe fuera del modelo aprobado; revision manual requerida.';
  END IF;

  -- No borrar ni reemplazar triggers desconocidos, incluidos los de Auth.
  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND ((n.nspname = 'auth' AND c.relname = 'users')
      OR (n.nspname = 'public'
          AND c.relname IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')));

  IF v_count < 2 OR v_count > 4 THEN
    RAISE EXCEPTION 'El inventario de triggers no internos cambio; se requiere revision manual.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal
      AND (
        (n.nspname = 'auth' AND c.relname = 'users'
          AND NOT (
            (t.tgname = 'on_auth_user_created'
              AND pn.nspname = 'public' AND p.proname = 'handle_new_auth_user'
              AND t.tgtype = 5 AND t.tgenabled = 'O'
              AND t.tgattr[0] IS NULL AND t.tgattr[1] IS NULL
              AND t.tgqual IS NULL AND t.tgnargs = 0
              AND t.tgargs = ''::bytea
              AND t.tgconstraint = 0 AND NOT t.tgdeferrable
              AND NOT t.tginitdeferred AND t.tgparentid = 0
              AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL)
            OR
            (t.tgname = 'trigger_crear_perfil'
              AND pn.nspname = 'public' AND p.proname = 'crear_perfil_usuario'
              AND t.tgtype = 5 AND t.tgenabled = 'O'
              AND t.tgattr[0] IS NULL AND t.tgattr[1] IS NULL
              AND t.tgqual IS NULL AND t.tgnargs = 0
              AND t.tgargs = ''::bytea
              AND t.tgconstraint = 0 AND NOT t.tgdeferrable
              AND NOT t.tginitdeferred AND t.tgparentid = 0
              AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL)
          ))
        OR
        (n.nspname = 'public' AND c.relname = 'reportes'
          AND NOT (
            (t.tgname = 'trigger_estado_inicial'
              AND pn.nspname = 'public' AND p.proname = 'registrar_estado_inicial'
              AND t.tgtype = 5 AND t.tgenabled = 'O'
              AND t.tgattr[0] IS NULL AND t.tgattr[1] IS NULL
              AND t.tgqual IS NULL AND t.tgnargs = 0
              AND t.tgargs = ''::bytea
              AND t.tgconstraint = 0 AND NOT t.tgdeferrable
              AND NOT t.tginitdeferred AND t.tgparentid = 0
              AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL)
            OR
            (t.tgname = 'trigger_cambio_estado'
              AND pn.nspname = 'public' AND p.proname = 'registrar_cambio_estado'
              AND t.tgtype = 19 AND t.tgenabled = 'O'
              AND t.tgattr[0] = (
                SELECT attnum FROM pg_attribute
                WHERE attrelid = 'public.reportes'::regclass
                  AND attname = 'estado_atencion'
              )
              AND t.tgattr[1] IS NULL
              AND t.tgqual IS NULL AND t.tgnargs = 0
              AND t.tgargs = ''::bytea
              AND t.tgconstraint = 0 AND NOT t.tgdeferrable
              AND NOT t.tginitdeferred AND t.tgparentid = 0
              AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL)
          ))
        OR (n.nspname = 'public' AND c.relname <> 'reportes')
      )
  ) THEN
    RAISE EXCEPTION 'Se encontro un trigger adicional o una definicion/evento inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.reportes'::regclass
      AND NOT t.tgisinternal AND t.tgname = 'trigger_estado_inicial'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.reportes'::regclass
      AND NOT t.tgisinternal AND t.tgname = 'trigger_cambio_estado'
  ) THEN
    RAISE EXCEPTION 'Falta un trigger conocido requerido por el estado inicial auditado.';
  END IF;

  -- Las definiciones completas de las funciones heredadas y operativas se
  -- comparan tras normalizar espacios; no basta con el nombre de la funcion.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_auth_user'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=public']::text[]
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$begin
            insert into public.usuarios (
              id_usuario,
              nombre_completo,
              correo_electronico,
              rol
            ) values (
              new.id,
              coalesce(new.raw_user_meta_data ->> 'nombre_completo', split_part(new.email, '@', 1)),
              lower(new.email),
              'Ciudadano'
            );
            return new;
          end;$body$, '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'handle_new_auth_user() ya no coincide con el cuerpo auditado; no se retirara su trigger automaticamente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.proconfig IS NULL
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$BEGIN
            INSERT INTO public.usuarios (id_usuario, nombre_completo, correo_electronico, telefono_contacto, rol, fecha_registro)
            VALUES (
              NEW.id,
              NEW.raw_user_meta_data->>'nombre_completo',
              NEW.email,
              NEW.raw_user_meta_data->>'telefono_contacto',
              'Ciudadano',
              NOW()
            );
            RETURN NEW;
          END;$body$, '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'handle_new_user() difiere del cuerpo auditado; revision manual requerida.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND p.proname = 'handle_new_user'
  ) THEN
    RAISE EXCEPTION 'handle_new_user() tiene ahora un trigger asociado; revision manual requerida.';
  END IF;

  -- El perfil se reemplaza solo si conserva el cuerpo funcional auditado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'crear_perfil_usuario'
      AND pg_get_userbyid(p.proowner) = 'postgres' AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$BEGIN

              INSERT INTO public.perfiles (
                  id_usuario,
                  nombre_completo,
                  rol
              )
              VALUES (
                  NEW.id,
                  COALESCE(
                      NEW.raw_user_meta_data ->> 'nombre_completo',
                      'Usuario'
                  ),
                  'ciudadano'
              );

              RETURN NEW;

          END;$body$, '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'crear_perfil_usuario() difiere del cuerpo auditado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'es_administrador'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND p.provolatile = 's'
      AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql')
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$SELECT EXISTS (
              SELECT 1
              FROM public.perfiles
              WHERE id_usuario = (SELECT auth.uid())
              AND rol = 'administrador'
          );$body$, '\s+', ' ', 'g'))
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'registrar_estado_inicial'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'registrar_cambio_estado'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'Helper o trigger de historial cambio de firma/seguridad/configuracion.';
  END IF;

  -- Verifica los cuerpos reales actuales de produccion antes de endurecerlos.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.registrar_estado_inicial()'::regprocedure
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$BEGIN

              INSERT INTO public.historial_estados (
                  id_reporte,
                  estado,
                  id_administrador
              )
              VALUES (
                  NEW.id_reporte,
                  NEW.estado_atencion,
                  NULL
              );

              RETURN NEW;

          END;$body$, '\s+', ' ', 'g'))
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.registrar_cambio_estado()'::regprocedure
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$BEGIN

              IF OLD.estado_atencion IS DISTINCT FROM NEW.estado_atencion THEN

                  INSERT INTO public.historial_estados (
                      id_reporte,
                      id_administrador,
                      estado
                  )
                  VALUES (
                      NEW.id_reporte,
                      auth.uid(),
                      NEW.estado_atencion
                  );

                  NEW.updated_at = NOW();

              END IF;

              RETURN NEW;

          END;$body$, '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'Una funcion de historial difiere del cuerpo actual auditado en produccion.';
  END IF;

  -- No sobrescribir funciones o vistas de otra propuesta parcialmente aplicada.
  IF to_regprocedure('public.proteger_rol_perfil()') IS NOT NULL
     OR to_regprocedure('public.proteger_eliminacion_ultimo_administrador()') IS NOT NULL
     OR to_regprocedure('public.asignar_rol_perfil(uuid,text)') IS NOT NULL
     OR to_regprocedure('public.actualizar_estado_reporte(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)') IS NOT NULL
     OR to_regprocedure('public.mis_reportes()') IS NOT NULL
     OR to_regprocedure('public.consultar_identidad_reportante(uuid)') IS NOT NULL
     OR to_regclass('public.mi_calle_limpieza_fotografias') IS NOT NULL
     OR to_regprocedure('public.mi_calle_ruta_fotografia_reservada(text)') IS NOT NULL
     OR to_regprocedure('public.mi_calle_inspeccionar_creacion_reporte(uuid,text)') IS NOT NULL
     OR to_regprocedure('public.mi_calle_reservar_limpieza_fotografia(text,uuid)') IS NOT NULL
     OR to_regprocedure('public.mi_calle_finalizar_limpieza_fotografia(text)') IS NOT NULL
     OR to_regprocedure('public.mi_calle_registrar_error_limpieza_fotografia(text,text)') IS NOT NULL
     OR to_regprocedure('public.mi_calle_reclamar_fotografias_huerfanas(integer)') IS NOT NULL
     OR to_regprocedure('public.mi_calle_pendientes_limpieza_fotografias(integer)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Existe una RPC V11.1 u objeto parcial; revision manual requerida.';
  END IF;

  IF to_regprocedure('auth.role()') IS NULL THEN
    RAISE EXCEPTION 'Falta auth.role(); no es posible validar el rol JWT de las RPC de limpieza.';
  END IF;

  -- Precondicion del bucket: existe y no se cambia Storage fuera de Mi Calle.
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'reportes'
      AND name = 'reportes'
      AND public
      AND file_size_limit IS NULL
      AND allowed_mime_types IS NULL
  ) THEN
    RAISE EXCEPTION 'La configuracion actual del bucket reportes difiere de la auditada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'objects'
      AND column_name = 'owner_id' AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'objects'
      AND column_name = 'metadata' AND data_type = 'jsonb'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'objects'
      AND column_name = 'created_at' AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'storage.objects no tiene owner_id/metadata/created_at con los tipos requeridos.';
  END IF;

  -- No se eliminan policies desconocidas. El baseline debe coincidir
  -- exactamente con las ocho policies y expresiones inspeccionadas.
  WITH expected(schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check) AS (
    VALUES
      ('public','perfiles','Consultar perfil propio o administrador','SELECT','PERMISSIVE',
       ARRAY['authenticated']::name[],
       '((id_usuario = ( SELECT auth.uid() AS uid)) OR ( SELECT es_administrador() AS es_administrador))',
       NULL::text),
      ('public','reportes','Consultar reportes publicos','SELECT','PERMISSIVE',
       ARRAY['anon','authenticated']::name[],'true',NULL::text),
      ('public','reportes','Crear reportes propios','INSERT','PERMISSIVE',
       ARRAY['authenticated']::name[],NULL::text,
       '((id_usuario = ( SELECT auth.uid() AS uid)) AND (estado_atencion = ''pendiente''::text))'),
      ('public','reportes','Administradores actualizan reportes','UPDATE','PERMISSIVE',
       ARRAY['authenticated']::name[],
       '( SELECT es_administrador() AS es_administrador)',
       '( SELECT es_administrador() AS es_administrador)'),
      ('public','ubicaciones','Consultar ubicaciones publicas','SELECT','PERMISSIVE',
       ARRAY['anon','authenticated']::name[],'true',NULL::text),
      ('public','ubicaciones','Usuarios autenticados crean ubicaciones','INSERT','PERMISSIVE',
       ARRAY['authenticated']::name[],NULL::text,'true'),
      ('public','fotografias','Consultar fotografias publicas','SELECT','PERMISSIVE',
       ARRAY['anon','authenticated']::name[],'true',NULL::text),
      ('public','historial_estados','Consultar historial publico','SELECT','PERMISSIVE',
       ARRAY['anon','authenticated']::name[],'true',NULL::text)
  ),
  actual AS (
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')
  )
  SELECT count(*) INTO v_mismatch
  FROM expected e
  FULL JOIN actual a USING (schemaname, tablename, policyname)
  WHERE e.policyname IS NULL OR a.policyname IS NULL
     OR e.cmd IS DISTINCT FROM a.cmd
     OR e.permissive IS DISTINCT FROM a.permissive
     OR e.roles IS DISTINCT FROM a.roles
     OR e.qual IS DISTINCT FROM a.qual
     OR e.with_check IS DISTINCT FROM a.with_check;

  IF v_mismatch <> 0
     OR (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')) <> 8
  THEN
    RAISE EXCEPTION 'Policies publicas desconocidas o definiciones distintas; no se modifico ninguna policy.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  ) THEN
    RAISE EXCEPTION 'storage.objects contiene policies no revisadas; no se eliminaran.';
  END IF;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'storage.objects'::regclass
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND permissive = 'PERMISSIVE'
      AND (
        'anon' = ANY(roles)
        OR 'public' = ANY(roles)
        OR ('authenticated' = ANY(roles) AND cmd IN ('SELECT', 'UPDATE', 'DELETE', 'ALL'))
      )
  ) THEN
    RAISE EXCEPTION 'Postcheck: storage.objects no tiene RLS activo o expone policies no autorizadas.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')
      AND (NOT c.relrowsecurity OR c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'RLS/ FORCE RLS no coincide con el estado actual auditado.';
  END IF;

  -- No tocar roles de plataforma ni concesiones directas desconocidas.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    WHERE n.nspname = 'public'
      AND c.relname IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')
      AND acl.grantee NOT IN (
        0,
        c.relowner,
        (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
      )
  ) THEN
    RAISE EXCEPTION 'Una tabla Mi Calle tiene concesiones directas a roles no auditados.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    WHERE n.nspname = 'storage'
      AND c.relname = 'objects'
      AND acl.grantee NOT IN (
        0,
        c.relowner,
        (SELECT oid FROM pg_roles WHERE rolname = 'postgres'),
        (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
      )
  ) THEN
    RAISE EXCEPTION 'storage.objects tiene concesiones directas a roles no auditados.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE ((n.nspname = 'public'
            AND c.relname IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados'))
        OR (n.nspname = 'storage' AND c.relname = 'objects'))
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attacl IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Existen grants por columna no cubiertos por el baseline auditado.';
  END IF;
END;
$preflight$;

-- 1. Un solo flujo Auth. Se retira el trigger heredado, no sus funciones.
-- El preflight permite que trigger_crear_perfil falte solo si no existe
-- ningun trigger alternativo/desconocido que replique la creacion de perfiles.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.crear_perfil_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.perfiles (id_usuario, nombre_completo, rol, fecha_registro)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'nombre_completo'), ''), 'Usuario'),
    'ciudadano',
    NOW()
  )
  ON CONFLICT (id_usuario) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_crear_perfil ON auth.users;
CREATE TRIGGER trigger_crear_perfil
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.crear_perfil_usuario();

-- 3. Proteccion de rol y serializacion del ultimo administrador.
CREATE FUNCTION public.proteger_rol_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_admin_count bigint;
BEGIN
  IF OLD.rol IS NOT DISTINCT FROM NEW.rol THEN
    RETURN NEW;
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Los cambios de rol requieren aislamiento READ COMMITTED.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mi_calle:asignacion_rol', 0));

  -- Bootstrap manual, solo desde una sesion privilegiada de SQL Editor,
  -- dentro de la transaccion y cuando aun no existe ningun administrador.
  IF v_actor IS NULL
     AND session_user = 'postgres'
     AND current_user = 'postgres'
     AND current_setting('mi_calle.bootstrap_first_admin', true) = 'on'
  THEN
    IF NEW.rol <> 'administrador' THEN
      RAISE EXCEPTION 'El bootstrap solo puede promover el primer administrador.';
    END IF;

    SELECT count(*) INTO v_admin_count
    FROM public.perfiles
    WHERE rol = 'administrador';

    IF v_admin_count <> 0 THEN
      RAISE EXCEPTION 'El bootstrap solo se permite cuando no hay administradores.';
    END IF;

    RETURN NEW;
  END IF;

  -- Revalidar la identidad/rol despues de esperar por el bloqueo.
  v_actor := (SELECT auth.uid());
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id_usuario = v_actor
      AND rol = 'administrador'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador autenticado puede cambiar roles.';
  END IF;

  IF OLD.rol = 'administrador' AND NEW.rol = 'ciudadano' THEN
    SELECT count(*) INTO v_admin_count
    FROM public.perfiles
    WHERE rol = 'administrador';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'No se puede degradar al ultimo administrador.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_proteger_rol_perfil
BEFORE UPDATE OF rol ON public.perfiles
FOR EACH ROW
EXECUTE FUNCTION public.proteger_rol_perfil();

CREATE FUNCTION public.proteger_eliminacion_ultimo_administrador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_count bigint;
BEGIN
  IF OLD.rol IS DISTINCT FROM 'administrador' THEN
    RETURN OLD;
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La eliminacion de administradores requiere aislamiento READ COMMITTED.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mi_calle:asignacion_rol', 0));

  SELECT count(*) INTO v_admin_count
  FROM public.perfiles
  WHERE rol = 'administrador';

  IF v_admin_count <= 1 THEN
    RAISE EXCEPTION 'No se puede eliminar al ultimo administrador.';
  END IF;

  RETURN OLD;
END;
$function$;

CREATE TRIGGER trigger_proteger_eliminacion_ultimo_administrador
BEFORE DELETE ON public.perfiles
FOR EACH ROW
EXECUTE FUNCTION public.proteger_eliminacion_ultimo_administrador();

CREATE FUNCTION public.asignar_rol_perfil(
  p_id_usuario uuid,
  p_rol text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La asignacion de roles requiere aislamiento READ COMMITTED.';
  END IF;

  IF v_actor IS NULL OR p_id_usuario IS NULL
     OR p_rol IS NULL
     OR p_rol NOT IN ('ciudadano','administrador')
  THEN
    RAISE EXCEPTION 'Sesion, usuario objetivo o rol no valido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id_usuario = v_actor AND rol = 'administrador'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede asignar roles.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mi_calle:asignacion_rol', 0));

  v_actor := (SELECT auth.uid());
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id_usuario = v_actor AND rol = 'administrador'
  ) THEN
    RAISE EXCEPTION 'La autorizacion administrativa dejo de ser valida.';
  END IF;

  UPDATE public.perfiles
  SET rol = p_rol
  WHERE id_usuario = p_id_usuario;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil objetivo no encontrado.';
  END IF;
END;
$function$;

-- 4. La relacion reportes -> ubicaciones sigue siendo FK, pero ya no UNIQUE.
ALTER TABLE public.reportes
  DROP CONSTRAINT reportes_id_ubicacion_key;

-- 5. Historial: se conservan los triggers existentes y se endurecen sus funciones.
-- La RPC deja app.mi_calle_observacion para que registrar_cambio_estado() registre
-- la observacion y actualice updated_at junto con el cambio de estado.
CREATE OR REPLACE FUNCTION public.registrar_estado_inicial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.registrar_cambio_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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

DROP TRIGGER IF EXISTS trigger_cambio_estado ON public.reportes;
CREATE TRIGGER trigger_cambio_estado
  BEFORE UPDATE OF estado_atencion ON public.reportes
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_cambio_estado();

CREATE FUNCTION public.actualizar_estado_reporte(
  p_id_reporte uuid,
  p_estado text,
  p_observacion text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF p_id_reporte IS NULL
     OR p_estado IS NULL
     OR p_estado NOT IN ('pendiente','en_revision','en_proceso','reparado')
  THEN
    RAISE EXCEPTION 'Reporte o estado no valido.';
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La actualizacion requiere aislamiento READ COMMITTED.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mi_calle:asignacion_rol', 0));

  v_actor := (SELECT auth.uid());
  IF v_actor IS NULL OR NOT public.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador autenticado puede actualizar reportes.';
  END IF;

  PERFORM set_config(
    'app.mi_calle_observacion',
    COALESCE(p_observacion, ''),
    true
  );

  UPDATE public.reportes
  SET estado_atencion = p_estado
  WHERE id_reporte = p_id_reporte;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte no encontrado.';
  END IF;
END;
$function$;

-- 6. RPC de creacion. Las escrituras relacionales/history son atomicas;
-- Storage se sube antes y requiere compensacion Node.js si esta RPC falla.
CREATE FUNCTION public.crear_reporte_completo(
  p_id_reporte uuid,
  p_tipo_problema text,
  p_descripcion text,
  p_storage_path text,
  p_latitud numeric DEFAULT NULL,
  p_longitud numeric DEFAULT NULL,
  p_direccion_texto text DEFAULT NULL,
  p_id_ubicacion uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_id_ubicacion uuid;
  v_expected_mime text;
  v_file_size bigint;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La creacion de reportes requiere aislamiento READ COMMITTED.';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesion Supabase autenticada.';
  END IF;

  IF p_id_reporte IS NULL OR p_tipo_problema IS NULL
     OR p_tipo_problema NOT IN ('bache','grieta','hundimiento','alcantarilla_sin_tapa','otro')
  THEN
    RAISE EXCEPTION 'Identificador o tipo de problema no valido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id_usuario = v_actor
  ) THEN
    RAISE EXCEPTION 'No existe un perfil para el usuario autenticado.';
  END IF;

  IF p_storage_path IS NULL
     OR p_storage_path !~ (
       '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
     )
  THEN
    RAISE EXCEPTION 'La ruta debe ser evidencias/UUID_ALEATORIO.ext.';
  END IF;

  v_expected_mime := CASE
    WHEN p_storage_path ~ '\.jpg$' THEN 'image/jpeg'
    WHEN p_storage_path ~ '\.png$' THEN 'image/png'
    WHEN p_storage_path ~ '\.webp$' THEN 'image/webp'
    ELSE NULL
  END;

  SELECT CASE
    WHEN COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]{1,7}$'
      THEN (o.metadata ->> 'size')::integer::bigint
    ELSE NULL
  END
  INTO v_file_size
  FROM storage.objects o
  WHERE o.bucket_id = 'reportes'
    AND o.name = p_storage_path
    AND o.owner_id = v_actor::text
    AND o.metadata ->> 'mimetype' = v_expected_mime
    AND COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]{1,7}$'
    AND CASE
      WHEN COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]{1,7}$'
        THEN (o.metadata ->> 'size')::integer <= 5242880
      ELSE false
    END
  FOR UPDATE OF o;

  IF NOT FOUND OR v_file_size IS NULL OR v_file_size > 5242880 THEN
    RAISE EXCEPTION 'No existe una fotografia propia con tipo/tamano permitido en Storage.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mi_calle_limpieza_fotografias l
    WHERE l.storage_path = p_storage_path
  ) THEN
    RAISE EXCEPTION 'La ruta de fotografia esta reservada o fue retirada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fotografias f
    WHERE f.storage_path = p_storage_path
  ) THEN
    RAISE EXCEPTION 'La fotografia ya esta asociada a un reporte.';
  END IF;

  IF p_id_ubicacion IS NULL THEN
    IF p_latitud IS NULL OR p_longitud IS NULL
       OR p_latitud < -90 OR p_latitud > 90
       OR p_longitud < -180 OR p_longitud > 180
    THEN
      RAISE EXCEPTION 'Coordenadas globales no validas.';
    END IF;

    INSERT INTO public.ubicaciones (
      id_ubicacion, latitud, longitud, direccion_texto
    )
    VALUES (
      pg_catalog.gen_random_uuid(),
      p_latitud,
      p_longitud,
      NULLIF(BTRIM(COALESCE(p_direccion_texto, '')), '')
    )
    RETURNING id_ubicacion INTO v_id_ubicacion;
  ELSE
    IF p_latitud IS NOT NULL OR p_longitud IS NOT NULL THEN
      RAISE EXCEPTION 'Al reutilizar ubicacion, omita latitud/longitud.';
    END IF;

    SELECT u.id_ubicacion INTO v_id_ubicacion
    FROM public.ubicaciones u
    WHERE u.id_ubicacion = p_id_ubicacion
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ubicacion no encontrada.';
    END IF;
  END IF;

  INSERT INTO public.reportes (
    id_reporte, id_usuario, id_ubicacion, tipo_problema,
    descripcion, estado_atencion, fecha_creacion, updated_at
  )
  VALUES (
    p_id_reporte, v_actor, v_id_ubicacion, p_tipo_problema,
    NULLIF(BTRIM(COALESCE(p_descripcion, '')), ''), 'pendiente',
    NOW(), NOW()
  );

  INSERT INTO public.fotografias (id_fotografia, id_reporte, storage_path, fecha_carga)
  VALUES (pg_catalog.gen_random_uuid(), p_id_reporte, p_storage_path, NOW());

  -- trigger_estado_inicial agrega la fila inicial al historial.
  RETURN p_id_reporte;
END;
$function$;

CREATE FUNCTION public.mis_reportes()
RETURNS TABLE (
  id_reporte uuid,
  id_ubicacion uuid,
  tipo_problema text,
  descripcion text,
  estado_atencion text,
  fecha_creacion timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesion Supabase autenticada.';
  END IF;

  RETURN QUERY
  SELECT r.id_reporte, r.id_ubicacion, r.tipo_problema, r.descripcion,
         r.estado_atencion, r.fecha_creacion, r.updated_at
  FROM public.reportes r
  WHERE r.id_usuario = v_actor
  ORDER BY r.fecha_creacion DESC;
END;
$function$;

CREATE FUNCTION public.consultar_identidad_reportante(p_id_reporte uuid)
RETURNS TABLE (
  id_usuario uuid,
  nombre_completo text,
  telefono character varying
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_id_usuario uuid;
  v_nombre text;
  v_telefono character varying;
BEGIN
  IF p_id_reporte IS NULL THEN
    RAISE EXCEPTION 'El identificador del reporte es obligatorio.';
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La consulta de identidades requiere aislamiento READ COMMITTED.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mi_calle:asignacion_rol', 0));

  v_actor := (SELECT auth.uid());
  IF v_actor IS NULL OR NOT public.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador autenticado puede consultar identidades.';
  END IF;

  SELECT p.id_usuario, p.nombre_completo, p.telefono
  INTO v_id_usuario, v_nombre, v_telefono
  FROM public.reportes r
  JOIN public.perfiles p ON p.id_usuario = r.id_usuario
  WHERE r.id_reporte = p_id_reporte;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte o identidad asociada no encontrada.';
  END IF;

  id_usuario := v_id_usuario;
  nombre_completo := v_nombre;
  telefono := v_telefono;
  RETURN NEXT;
END;
$function$;

-- 7. Tombstones serializan la asociacion PostgreSQL y la limpieza fisica.
-- Una ruta reservada nunca vuelve a ser aceptada por la RPC o la policy.
CREATE TABLE public.mi_calle_limpieza_fotografias (
  storage_path text NOT NULL,
  id_reporte uuid,
  estado text NOT NULL DEFAULT 'pendiente',
  intentos integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  eliminado_en timestamptz,
  ultimo_error text,
  CONSTRAINT mi_calle_limpieza_fotografias_pkey PRIMARY KEY (storage_path),
  CONSTRAINT mi_calle_limpieza_fotografias_ruta_check
    CHECK (storage_path ~ '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  CONSTRAINT mi_calle_limpieza_fotografias_estado_check
    CHECK (estado IN ('pendiente', 'eliminado')),
  CONSTRAINT mi_calle_limpieza_fotografias_intentos_check
    CHECK (intentos >= 0),
  CONSTRAINT mi_calle_limpieza_fotografias_eliminado_check
    CHECK ((estado = 'eliminado') = (eliminado_en IS NOT NULL))
);

CREATE INDEX mi_calle_limpieza_fotografias_pendientes_idx
  ON public.mi_calle_limpieza_fotografias (creado_en)
  WHERE estado = 'pendiente';

ALTER TABLE public.mi_calle_limpieza_fotografias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mi_calle_limpieza_fotografias
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mi_calle_ruta_fotografia_reservada(p_storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_storage_path ~
           '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
         AND EXISTS (
           SELECT 1
           FROM public.mi_calle_limpieza_fotografias l
           WHERE l.storage_path = p_storage_path
         );
$function$;

CREATE FUNCTION public.mi_calle_inspeccionar_creacion_reporte(
  p_id_reporte uuid,
  p_storage_path text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_report_exists boolean;
  v_photo_report uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend.';
  END IF;
  IF p_id_reporte IS NULL
     OR p_storage_path IS NULL
     OR p_storage_path !~ '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  THEN
    RAISE EXCEPTION 'Identificador o ruta de fotografia no validos.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reportes r
    WHERE r.id_reporte = p_id_reporte
  ) INTO v_report_exists;

  SELECT f.id_reporte INTO v_photo_report
  FROM public.fotografias f
  WHERE f.storage_path = p_storage_path;

  IF v_report_exists AND v_photo_report = p_id_reporte THEN
    RETURN 'confirmado';
  END IF;
  IF v_report_exists OR v_photo_report IS NOT NULL THEN
    RETURN 'inconsistente';
  END IF;
  RETURN 'sin_asociacion';
END;
$function$;

CREATE FUNCTION public.mi_calle_reservar_limpieza_fotografia(
  p_storage_path text,
  p_id_reporte uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_object_exists boolean := false;
  v_existing_estado text;
  v_existing_report uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La reserva de limpieza requiere aislamiento READ COMMITTED.';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend.';
  END IF;

  IF p_storage_path IS NULL
     OR p_storage_path !~ '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  THEN
    RAISE EXCEPTION 'Ruta de fotografia fuera del contrato aprobado.';
  END IF;

  PERFORM 1
  FROM storage.objects o
  WHERE o.bucket_id = 'reportes'
    AND o.name = p_storage_path
  FOR UPDATE OF o;
  v_object_exists := FOUND;

  IF EXISTS (
    SELECT 1 FROM public.fotografias f
    WHERE f.storage_path = p_storage_path
  ) THEN
    RETURN 'asociado';
  END IF;

  IF p_id_reporte IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reportes r
    WHERE r.id_reporte = p_id_reporte
  ) THEN
    RETURN 'inconsistente';
  END IF;

  SELECT l.estado, l.id_reporte
  INTO v_existing_estado, v_existing_report
  FROM public.mi_calle_limpieza_fotografias l
  WHERE l.storage_path = p_storage_path
  FOR UPDATE;

  IF FOUND THEN
    IF p_id_reporte IS NOT NULL
       AND v_existing_report IS NOT NULL
       AND v_existing_report <> p_id_reporte
    THEN
      RETURN 'inconsistente';
    END IF;

    IF v_existing_estado = 'eliminado' AND v_object_exists THEN
      UPDATE public.mi_calle_limpieza_fotografias
      SET estado = 'pendiente',
          eliminado_en = NULL,
          id_reporte = COALESCE(id_reporte, p_id_reporte),
          actualizado_en = now()
      WHERE storage_path = p_storage_path;
      RETURN 'pendiente';
    END IF;

    IF v_existing_report IS NULL AND p_id_reporte IS NOT NULL THEN
      UPDATE public.mi_calle_limpieza_fotografias
      SET id_reporte = p_id_reporte,
          actualizado_en = now()
      WHERE storage_path = p_storage_path;
    END IF;
    RETURN v_existing_estado;
  END IF;

  IF NOT v_object_exists THEN
    RETURN 'ausente';
  END IF;

  INSERT INTO public.mi_calle_limpieza_fotografias (storage_path, id_reporte)
  VALUES (p_storage_path, p_id_reporte);
  RETURN 'pendiente';
END;
$function$;

CREATE FUNCTION public.mi_calle_finalizar_limpieza_fotografia(p_storage_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id_reporte uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La finalizacion de limpieza requiere aislamiento READ COMMITTED.';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend.';
  END IF;

  SELECT l.id_reporte INTO v_id_reporte
  FROM public.mi_calle_limpieza_fotografias l
  WHERE l.storage_path = p_storage_path
    AND l.estado = 'pendiente'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe una reserva pendiente para esta fotografia.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'reportes' AND o.name = p_storage_path
  ) OR EXISTS (
    SELECT 1 FROM public.fotografias f
    WHERE f.storage_path = p_storage_path
  ) OR (
    v_id_reporte IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.reportes r WHERE r.id_reporte = v_id_reporte
    )
  ) THEN
    RAISE EXCEPTION 'La fotografia sigue presente o tiene una asociacion; no se finaliza la limpieza.';
  END IF;

  UPDATE public.mi_calle_limpieza_fotografias
  SET estado = 'eliminado',
      eliminado_en = now(),
      actualizado_en = now(),
      ultimo_error = NULL
  WHERE storage_path = p_storage_path;
END;
$function$;

CREATE FUNCTION public.mi_calle_registrar_error_limpieza_fotografia(
  p_storage_path text,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend.';
  END IF;

  UPDATE public.mi_calle_limpieza_fotografias
  SET intentos = intentos + 1,
      actualizado_en = now(),
      ultimo_error = left(COALESCE(p_error, 'Error no especificado.'), 1000)
  WHERE storage_path = p_storage_path
    AND estado = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe una reserva pendiente para registrar el error.';
  END IF;
END;
$function$;

CREATE FUNCTION public.mi_calle_reclamar_fotografias_huerfanas(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_object record;
  v_claimed integer := 0;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La reclamacion de fotografias requiere aislamiento READ COMMITTED.';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend.';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'El lote debe estar entre 1 y 500.';
  END IF;

  FOR v_object IN
    SELECT o.name
    FROM storage.objects o
    WHERE o.bucket_id = 'reportes'
      AND o.name ~ '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
      AND o.created_at < now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.fotografias f WHERE f.storage_path = o.name
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.mi_calle_limpieza_fotografias l
        WHERE l.storage_path = o.name
      )
    ORDER BY o.created_at
    LIMIT p_limit
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    INSERT INTO public.mi_calle_limpieza_fotografias (storage_path)
    VALUES (v_object.name)
    ON CONFLICT (storage_path) DO NOTHING;
    IF FOUND THEN
      v_claimed := v_claimed + 1;
    END IF;
  END LOOP;

  RETURN v_claimed;
END;
$function$;

CREATE FUNCTION public.mi_calle_pendientes_limpieza_fotografias(p_limit integer DEFAULT 100)
RETURNS TABLE (storage_path text, id_reporte uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacion reservada al backend.';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'El lote debe estar entre 1 y 500.';
  END IF;

  RETURN QUERY
  SELECT l.storage_path, l.id_reporte
  FROM public.mi_calle_limpieza_fotografias l
  WHERE l.estado = 'pendiente'
  ORDER BY l.actualizado_en, l.creado_en
  LIMIT p_limit;
END;
$function$;

-- 8. Vistas publicas con privilegios de columna tambien limitados en tablas base.
CREATE VIEW public.reportes_publicos
WITH (security_invoker = true)
AS
SELECT r.id_reporte, r.id_ubicacion, r.tipo_problema,
       r.descripcion, r.estado_atencion, r.fecha_creacion, r.updated_at
FROM public.reportes AS r;

CREATE VIEW public.historial_estados_publico
WITH (security_invoker = true)
AS
SELECT h.id_historial, h.id_reporte, h.estado, h.fecha_cambio
FROM public.historial_estados AS h;

-- 9. Grants minimos. No se alteran service_role ni roles internos de Supabase.
REVOKE ALL ON public.perfiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.reportes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ubicaciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fotografias FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.historial_estados FROM PUBLIC, anon, authenticated;

REVOKE ALL (id_usuario, nombre_completo, telefono, rol, fecha_registro)
  ON public.perfiles FROM PUBLIC, anon, authenticated;
REVOKE ALL (id_reporte, id_usuario, id_ubicacion, tipo_problema, descripcion, estado_atencion, fecha_creacion, updated_at)
  ON public.reportes FROM PUBLIC, anon, authenticated;
REVOKE ALL (id_ubicacion, latitud, longitud, direccion_texto)
  ON public.ubicaciones FROM PUBLIC, anon, authenticated;
REVOKE ALL (id_fotografia, id_reporte, storage_path, fecha_carga)
  ON public.fotografias FROM PUBLIC, anon, authenticated;
REVOKE ALL (id_historial, id_reporte, id_administrador, estado, fecha_cambio, observacion)
  ON public.historial_estados FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.perfiles TO authenticated;
GRANT UPDATE (nombre_completo, telefono) ON public.perfiles TO authenticated;

GRANT SELECT (id_reporte, id_ubicacion, tipo_problema, descripcion,
              estado_atencion, fecha_creacion, updated_at)
  ON public.reportes TO anon, authenticated;
GRANT SELECT ON public.ubicaciones TO anon, authenticated;
GRANT SELECT (id_fotografia, id_reporte, storage_path, fecha_carga)
  ON public.fotografias TO anon, authenticated;
GRANT SELECT (id_historial, id_reporte, estado, fecha_cambio)
  ON public.historial_estados TO anon, authenticated;

REVOKE ALL ON public.reportes_publicos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.historial_estados_publico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reportes_publicos TO anon, authenticated;
GRANT SELECT ON public.historial_estados_publico TO anon, authenticated;

-- El listado de storage.objects queda bloqueado por RLS (0 policies SELECT).
-- SELECT + INSERT para authenticated habilita INSERT ... RETURNING en Storage API
-- durante la subida temporal; DELETE se reserva al service_role de backend.

-- 10. RLS: policies conocidas reemplazadas tras verificarse en preflight.
DROP POLICY "Consultar perfil propio o administrador" ON public.perfiles;
DROP POLICY "Consultar reportes publicos" ON public.reportes;
DROP POLICY "Crear reportes propios" ON public.reportes;
DROP POLICY "Administradores actualizan reportes" ON public.reportes;
DROP POLICY "Consultar ubicaciones publicas" ON public.ubicaciones;
DROP POLICY "Usuarios autenticados crean ubicaciones" ON public.ubicaciones;
DROP POLICY "Consultar fotografias publicas" ON public.fotografias;
DROP POLICY "Consultar historial publico" ON public.historial_estados;

CREATE POLICY "Consultar perfiles propios o administrativos"
ON public.perfiles FOR SELECT TO authenticated
USING (id_usuario = (SELECT auth.uid()) OR (SELECT public.es_administrador()));

CREATE POLICY "Actualizar perfil propio"
ON public.perfiles FOR UPDATE TO authenticated
USING (id_usuario = (SELECT auth.uid()))
WITH CHECK (id_usuario = (SELECT auth.uid()));

CREATE POLICY "Consultar reportes publicos"
ON public.reportes FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Consultar ubicaciones publicas"
ON public.ubicaciones FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Consultar fotografias publicas"
ON public.fotografias FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Consultar historial publico"
ON public.historial_estados FOR SELECT TO anon, authenticated
USING (true);

-- 11. Storage: descarga publica por bucket, sin listado SQL, y subida temporal
-- con ruta aleatoria ligada al owner_id autenticado.
-- La pertenencia del reporte y la fila fotografias se verifican en la RPC,
-- despues de la subida temporal, porque aun no existen al evaluar INSERT.
DO $bucket_update$
DECLARE
  v_rows integer;
BEGIN
  UPDATE storage.buckets
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
  WHERE id = 'reportes'
    AND name = 'reportes';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'No se actualizo exactamente el bucket reportes esperado.';
  END IF;
END;
$bucket_update$;

CREATE POLICY "Subida autenticada con ruta Mi Calle"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reportes'
  AND owner_id = (SELECT auth.uid())::text
  AND name ~ '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  AND (
    (name ~ '\.jpg$' AND metadata ->> 'mimetype' = 'image/jpeg')
    OR (name ~ '\.png$' AND metadata ->> 'mimetype' = 'image/png')
    OR (name ~ '\.webp$' AND metadata ->> 'mimetype' = 'image/webp')
  )
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]{1,7}$'
      THEN (metadata ->> 'size')::integer <= 5242880
    ELSE false
  END
  AND NOT public.mi_calle_ruta_fotografia_reservada(name)
);

-- 12. EXECUTE. Las funciones trigger se invocan por sus triggers, no por RPC.
REVOKE EXECUTE ON FUNCTION public.crear_perfil_usuario() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.proteger_rol_perfil() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.proteger_eliminacion_ultimo_administrador() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_estado_inicial() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_cambio_estado() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.es_administrador() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.es_administrador() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.asignar_rol_perfil(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_rol_perfil(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.actualizar_estado_reporte(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_reporte(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.crear_reporte_completo(uuid, text, text, text, numeric, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_reporte_completo(uuid, text, text, text, numeric, numeric, text, uuid)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mis_reportes() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mis_reportes() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.consultar_identidad_reportante(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consultar_identidad_reportante(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mi_calle_ruta_fotografia_reservada(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mi_calle_ruta_fotografia_reservada(text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mi_calle_inspeccionar_creacion_reporte(uuid,text),
  public.mi_calle_reservar_limpieza_fotografia(text,uuid),
  public.mi_calle_finalizar_limpieza_fotografia(text),
  public.mi_calle_registrar_error_limpieza_fotografia(text,text),
  public.mi_calle_reclamar_fotografias_huerfanas(integer),
  public.mi_calle_pendientes_limpieza_fotografias(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mi_calle_inspeccionar_creacion_reporte(uuid,text),
  public.mi_calle_reservar_limpieza_fotografia(text,uuid),
  public.mi_calle_finalizar_limpieza_fotografia(text),
  public.mi_calle_registrar_error_limpieza_fotografia(text,text),
  public.mi_calle_reclamar_fotografias_huerfanas(integer),
  public.mi_calle_pendientes_limpieza_fotografias(integer)
  TO service_role;

-- 13. Verificaciones posteriores; cualquier fallo revierte la transaccion.
DO $postcheck$
DECLARE
  v_orig_search_path text := current_setting('search_path');
  v_count integer;
  v_policy_count integer;
  v_location_attnum smallint;
  v_expected_storage_check text;
  r record;
BEGIN
  PERFORM set_config('search_path', '', true);
  v_expected_storage_check := btrim(regexp_replace($storage_check$
    ((bucket_id = 'reportes'::text)
      AND (owner_id = (( SELECT auth.uid() AS uid))::text)
      AND (name ~ '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'::text)
      AND (((name ~ '\.jpg$'::text) AND ((metadata ->> 'mimetype'::text) = 'image/jpeg'::text))
        OR ((name ~ '\.png$'::text) AND ((metadata ->> 'mimetype'::text) = 'image/png'::text))
        OR ((name ~ '\.webp$'::text) AND ((metadata ->> 'mimetype'::text) = 'image/webp'::text)))
      AND CASE
        WHEN (COALESCE((metadata ->> 'size'::text), ''::text) ~ '^[0-9]{1,7}$'::text)
          THEN (((metadata ->> 'size'::text))::integer <= 5242880)
        ELSE false
      END
      AND (NOT mi_calle_ruta_fotografia_reservada(name)))
  $storage_check$, '\s+', ' ', 'g'));

  SELECT count(*) INTO v_count
  FROM pg_trigger t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND NOT t.tgisinternal
    AND t.tgname = 'trigger_crear_perfil'
    AND t.tgfoid = 'public.crear_perfil_usuario()'::regprocedure
    AND t.tgtype = 5
    AND t.tgattr[0] IS NULL AND t.tgattr[1] IS NULL
    AND t.tgenabled = 'O'
    AND t.tgqual IS NULL
    AND t.tgnargs = 0
    AND t.tgargs = ''::bytea
    AND t.tgconstraint = 0
    AND NOT t.tgdeferrable
    AND NOT t.tginitdeferred
    AND t.tgparentid = 0
    AND t.tgoldtable IS NULL
    AND t.tgnewtable IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Postcheck: flujo Auth no unico o no habilitado.';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND ((n.nspname = 'auth' AND c.relname = 'users')
      OR (n.nspname = 'public'
          AND c.relname IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')));
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Postcheck: hay triggers de aplicacion adicionales o faltantes.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid IN (
      'public.perfiles'::regclass,
      'public.reportes'::regclass,
      'public.ubicaciones'::regclass,
      'public.fotografias'::regclass,
      'public.historial_estados'::regclass,
      'public.mi_calle_limpieza_fotografias'::regclass,
      'storage.objects'::regclass
    )
      AND (NOT c.relrowsecurity OR c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'Postcheck: RLS de una tabla no coincide con lo esperado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
  ) THEN
    RAISE EXCEPTION 'Postcheck: el trigger heredado sigue presente.';
  END IF;

  IF (SELECT count(*) FROM pg_trigger t
      WHERE t.tgrelid = 'auth.users'::regclass
        AND NOT t.tgisinternal) <> 1 THEN
    RAISE EXCEPTION 'Postcheck: auth.users debe conservar exactamente trigger_crear_perfil.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.handle_new_auth_user()'::regprocedure
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.handle_new_user()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Postcheck: una funcion heredada fue eliminada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'crear_perfil_usuario','es_administrador','proteger_rol_perfil',
        'proteger_eliminacion_ultimo_administrador',
        'asignar_rol_perfil','registrar_estado_inicial','registrar_cambio_estado',
        'actualizar_estado_reporte','crear_reporte_completo','mis_reportes',
        'consultar_identidad_reportante','mi_calle_ruta_fotografia_reservada',
        'mi_calle_inspeccionar_creacion_reporte','mi_calle_reservar_limpieza_fotografia',
        'mi_calle_finalizar_limpieza_fotografia','mi_calle_registrar_error_limpieza_fotografia',
        'mi_calle_reclamar_fotografias_huerfanas','mi_calle_pendientes_limpieza_fotografias'
      )
      AND (
        NOT p.prosecdef
        OR pg_get_userbyid(p.proowner) <> 'postgres'
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'Postcheck: funcion SECURITY DEFINER/owner/search_path inesperado.';
  END IF;

  -- Verifica que las funciones endurecidas de historial quedaron instaladas.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.registrar_estado_inicial()'::regprocedure
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$begin
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
          end;$body$, '\s+', ' ', 'g'))
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.registrar_cambio_estado()'::regprocedure
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$declare
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
          end;$body$, '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'Postcheck: las funciones endurecidas de historial no quedaron instaladas.';
  END IF;

  IF (
    SELECT array_agg(
      a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
      ORDER BY a.attnum
    )
    FROM pg_attribute a
    WHERE a.attrelid = 'public.mi_calle_limpieza_fotografias'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  ) IS DISTINCT FROM ARRAY[
    'storage_path:text:true',
    'id_reporte:uuid:false',
    'estado:text:true',
    'intentos:integer:true',
    'creado_en:timestamp with time zone:true',
    'actualizado_en:timestamp with time zone:true',
    'eliminado_en:timestamp with time zone:false',
    'ultimo_error:text:false'
  ]::text[]
     OR (SELECT count(*) FROM pg_constraint
         WHERE conrelid = 'public.mi_calle_limpieza_fotografias'::regclass
           AND contype IN ('p','c') AND convalidated) <> 5
     OR (SELECT array_agg(conname::text ORDER BY conname)
         FROM pg_constraint
         WHERE conrelid = 'public.mi_calle_limpieza_fotografias'::regclass
           AND contype IN ('p','c'))
        IS DISTINCT FROM ARRAY[
          'mi_calle_limpieza_fotografias_eliminado_check',
          'mi_calle_limpieza_fotografias_estado_check',
          'mi_calle_limpieza_fotografias_intentos_check',
          'mi_calle_limpieza_fotografias_pkey',
          'mi_calle_limpieza_fotografias_ruta_check'
        ]::text[]
     OR (SELECT count(*) FROM pg_index
         WHERE indrelid = 'public.mi_calle_limpieza_fotografias'::regclass) <> 2
     OR NOT EXISTS (
          SELECT 1
          FROM pg_index i
          JOIN pg_class idx ON idx.oid = i.indexrelid
          JOIN pg_attribute a
            ON a.attrelid = i.indrelid
           AND a.attname = 'creado_en'
          WHERE i.indrelid = 'public.mi_calle_limpieza_fotografias'::regclass
            AND idx.relname = 'mi_calle_limpieza_fotografias_pendientes_idx'
            AND i.indisvalid AND i.indisready AND NOT i.indisunique
            AND i.indnkeyatts = 1
            AND i.indkey[0] = a.attnum
            AND pg_get_expr(i.indpred, i.indrelid) = '(estado = ''pendiente''::text)'
        )
     OR (SELECT count(*) FROM pg_trigger
         WHERE tgrelid = 'public.mi_calle_limpieza_fotografias'::regclass
           AND NOT tgisinternal) <> 0
     OR (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'mi_calle_limpieza_fotografias') <> 0
     OR pg_get_userbyid((
          SELECT relowner FROM pg_class
          WHERE oid = 'public.mi_calle_limpieza_fotografias'::regclass
        )) <> 'postgres'
     OR has_table_privilege('anon','public.mi_calle_limpieza_fotografias','SELECT')
     OR has_table_privilege('anon','public.mi_calle_limpieza_fotografias','INSERT')
     OR has_table_privilege('anon','public.mi_calle_limpieza_fotografias','UPDATE')
     OR has_table_privilege('anon','public.mi_calle_limpieza_fotografias','DELETE')
     OR has_table_privilege('authenticated','public.mi_calle_limpieza_fotografias','SELECT')
     OR has_table_privilege('authenticated','public.mi_calle_limpieza_fotografias','INSERT')
     OR has_table_privilege('authenticated','public.mi_calle_limpieza_fotografias','UPDATE')
     OR has_table_privilege('authenticated','public.mi_calle_limpieza_fotografias','DELETE')
     OR has_table_privilege('service_role','public.mi_calle_limpieza_fotografias','SELECT')
     OR has_table_privilege('service_role','public.mi_calle_limpieza_fotografias','INSERT')
     OR has_table_privilege('service_role','public.mi_calle_limpieza_fotografias','UPDATE')
     OR has_table_privilege('service_role','public.mi_calle_limpieza_fotografias','DELETE')
  THEN
    RAISE EXCEPTION 'Postcheck: tabla tecnica de tombstones, RLS o permisos inesperados.';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.mi_calle_ruta_fotografia_reservada(text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.mi_calle_ruta_fotografia_reservada(text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.mi_calle_ruta_fotografia_reservada(text)',
       'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_proc p
       WHERE p.oid IN (
         'public.mi_calle_inspeccionar_creacion_reporte(uuid,text)'::regprocedure,
         'public.mi_calle_reservar_limpieza_fotografia(text,uuid)'::regprocedure,
         'public.mi_calle_finalizar_limpieza_fotografia(text)'::regprocedure,
         'public.mi_calle_registrar_error_limpieza_fotografia(text,text)'::regprocedure,
         'public.mi_calle_reclamar_fotografias_huerfanas(integer)'::regprocedure,
         'public.mi_calle_pendientes_limpieza_fotografias(integer)'::regprocedure
       )
         AND (
           NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
           OR has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
         )
     )
  THEN
    RAISE EXCEPTION 'Postcheck: EXECUTE de las funciones de limpieza no coincide con el contrato.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)'::regprocedure
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$DECLARE
            v_actor uuid := (SELECT auth.uid());
            v_id_ubicacion uuid;
            v_expected_mime text;
            v_file_size bigint;
          BEGIN
            IF current_setting('transaction_isolation') <> 'read committed' THEN
              RAISE EXCEPTION 'La creacion de reportes requiere aislamiento READ COMMITTED.';
            END IF;

            IF v_actor IS NULL THEN
              RAISE EXCEPTION 'Se requiere una sesion Supabase autenticada.';
            END IF;

            IF p_id_reporte IS NULL OR p_tipo_problema IS NULL
               OR p_tipo_problema NOT IN ('bache','grieta','hundimiento','alcantarilla_sin_tapa','otro')
            THEN
              RAISE EXCEPTION 'Identificador o tipo de problema no valido.';
            END IF;

            IF NOT EXISTS (
              SELECT 1 FROM public.perfiles
              WHERE id_usuario = v_actor
            ) THEN
              RAISE EXCEPTION 'No existe un perfil para el usuario autenticado.';
            END IF;

            IF p_storage_path IS NULL
               OR p_storage_path !~ (
                 '^evidencias/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
               )
            THEN
              RAISE EXCEPTION 'La ruta debe ser evidencias/UUID_ALEATORIO.ext.';
            END IF;

            v_expected_mime := CASE
              WHEN p_storage_path ~ '\.jpg$' THEN 'image/jpeg'
              WHEN p_storage_path ~ '\.png$' THEN 'image/png'
              WHEN p_storage_path ~ '\.webp$' THEN 'image/webp'
              ELSE NULL
            END;

            SELECT CASE
              WHEN COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]{1,7}$'
                THEN (o.metadata ->> 'size')::integer::bigint
              ELSE NULL
            END
            INTO v_file_size
            FROM storage.objects o
            WHERE o.bucket_id = 'reportes'
              AND o.name = p_storage_path
              AND o.owner_id = v_actor::text
              AND o.metadata ->> 'mimetype' = v_expected_mime
              AND COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]{1,7}$'
              AND CASE
                WHEN COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]{1,7}$'
                  THEN (o.metadata ->> 'size')::integer <= 5242880
                ELSE false
              END
            FOR UPDATE OF o;

            IF NOT FOUND OR v_file_size IS NULL OR v_file_size > 5242880 THEN
              RAISE EXCEPTION 'No existe una fotografia propia con tipo/tamano permitido en Storage.';
            END IF;

            IF EXISTS (
              SELECT 1
              FROM public.mi_calle_limpieza_fotografias l
              WHERE l.storage_path = p_storage_path
            ) THEN
              RAISE EXCEPTION 'La ruta de fotografia esta reservada o fue retirada.';
            END IF;

            IF EXISTS (
              SELECT 1
              FROM public.fotografias f
              WHERE f.storage_path = p_storage_path
            ) THEN
              RAISE EXCEPTION 'La fotografia ya esta asociada a un reporte.';
            END IF;

            IF p_id_ubicacion IS NULL THEN
              IF p_latitud IS NULL OR p_longitud IS NULL
                 OR p_latitud < -90 OR p_latitud > 90
                 OR p_longitud < -180 OR p_longitud > 180
              THEN
                RAISE EXCEPTION 'Coordenadas globales no validas.';
              END IF;

              INSERT INTO public.ubicaciones (
                id_ubicacion, latitud, longitud, direccion_texto
              )
              VALUES (
                pg_catalog.gen_random_uuid(),
                p_latitud,
                p_longitud,
                NULLIF(BTRIM(COALESCE(p_direccion_texto, '')), '')
              )
              RETURNING id_ubicacion INTO v_id_ubicacion;
            ELSE
              IF p_latitud IS NOT NULL OR p_longitud IS NOT NULL THEN
                RAISE EXCEPTION 'Al reutilizar ubicacion, omita latitud/longitud.';
              END IF;

              SELECT u.id_ubicacion INTO v_id_ubicacion
              FROM public.ubicaciones u
              WHERE u.id_ubicacion = p_id_ubicacion
              FOR KEY SHARE;

              IF NOT FOUND THEN
                RAISE EXCEPTION 'Ubicacion no encontrada.';
              END IF;
            END IF;

            INSERT INTO public.reportes (
              id_reporte, id_usuario, id_ubicacion, tipo_problema,
              descripcion, estado_atencion, fecha_creacion, updated_at
            )
            VALUES (
              p_id_reporte, v_actor, v_id_ubicacion, p_tipo_problema,
              NULLIF(BTRIM(COALESCE(p_descripcion, '')), ''), 'pendiente',
              NOW(), NOW()
            );

            INSERT INTO public.fotografias (id_fotografia, id_reporte, storage_path, fecha_carga)
            VALUES (pg_catalog.gen_random_uuid(), p_id_reporte, p_storage_path, NOW());

            -- trigger_estado_inicial agrega la fila inicial al historial.
            RETURN p_id_reporte;
          END;$body$, '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'Postcheck: RPC no valida el contrato de ruta/propiedad/MIME/tamano esperado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)'::regprocedure::oid,
          'for update of o'
        ),
        (
          'public.mi_calle_reservar_limpieza_fotografia(text,uuid)'::regprocedure::oid,
          'for update of o'
        ),
        (
          'public.mi_calle_reclamar_fotografias_huerfanas(integer)'::regprocedure::oid,
          'for update of o skip locked'
        ),
        (
          'public.mi_calle_finalizar_limpieza_fotografia(text)'::regprocedure::oid,
          'for update'
        )
    ) AS expected(function_oid, critical_marker)
    JOIN pg_proc p ON p.oid = expected.function_oid
    CROSS JOIN LATERAL (
      SELECT lower(regexp_replace(p.prosrc, '\s+', ' ', 'g')) AS normalized_source
    ) source
    WHERE position(
            'if current_setting(''transaction_isolation'') <> ''read committed'' then'
            IN source.normalized_source
          ) = 0
       OR position(
            'if current_setting(''transaction_isolation'') <> ''read committed'' then'
            IN source.normalized_source
          ) >= position(expected.critical_marker IN source.normalized_source)
  ) THEN
    RAISE EXCEPTION 'Postcheck: las RPC de fotografia deben exigir READ COMMITTED antes de operar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.crear_perfil_usuario()'::regprocedure
      AND btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) =
          btrim(regexp_replace($body$BEGIN
            INSERT INTO public.perfiles (id_usuario, nombre_completo, rol, fecha_registro)
            VALUES (
              NEW.id,
              COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'nombre_completo'), ''), 'Usuario'),
              'ciudadano',
              NOW()
            )
            ON CONFLICT (id_usuario) DO NOTHING;
            RETURN NEW;
          END;$body$, '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'Postcheck: crear_perfil_usuario() no coincide con el flujo ciudadano esperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.perfiles'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'trigger_proteger_rol_perfil'
      AND t.tgfoid = 'public.proteger_rol_perfil()'::regprocedure
      AND t.tgtype = 19
      AND t.tgattr[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.perfiles'::regclass AND attname = 'rol'
      )
      AND t.tgattr[1] IS NULL
      AND t.tgqual IS NULL
      AND t.tgnargs = 0
      AND t.tgargs = ''::bytea
      AND t.tgconstraint = 0
      AND NOT t.tgdeferrable
      AND NOT t.tginitdeferred
      AND t.tgparentid = 0
      AND t.tgoldtable IS NULL
      AND t.tgnewtable IS NULL
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'Postcheck: trigger de proteccion de rol incorrecto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.perfiles'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'trigger_proteger_eliminacion_ultimo_administrador'
      AND t.tgfoid = 'public.proteger_eliminacion_ultimo_administrador()'::regprocedure
      AND t.tgtype = 11
      AND t.tgattr[0] IS NULL AND t.tgattr[1] IS NULL
      AND t.tgqual IS NULL
      AND t.tgnargs = 0
      AND t.tgargs = ''::bytea
      AND t.tgconstraint = 0
      AND NOT t.tgdeferrable
      AND NOT t.tginitdeferred
      AND t.tgparentid = 0
      AND t.tgoldtable IS NULL
      AND t.tgnewtable IS NULL
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'Postcheck: trigger de proteccion contra eliminar al ultimo administrador incorrecto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.reportes'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'trigger_estado_inicial'
      AND t.tgfoid = 'public.registrar_estado_inicial()'::regprocedure
      AND t.tgtype = 5
      AND t.tgattr[0] IS NULL AND t.tgattr[1] IS NULL
      AND t.tgqual IS NULL
      AND t.tgnargs = 0
      AND t.tgargs = ''::bytea
      AND t.tgconstraint = 0
      AND NOT t.tgdeferrable
      AND NOT t.tginitdeferred
      AND t.tgparentid = 0
      AND t.tgoldtable IS NULL
      AND t.tgnewtable IS NULL
      AND t.tgenabled = 'O'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.reportes'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'trigger_cambio_estado'
      AND t.tgfoid = 'public.registrar_cambio_estado()'::regprocedure
      AND t.tgtype = 19
      AND t.tgattr[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.reportes'::regclass
          AND attname = 'estado_atencion'
      )
      AND t.tgattr[1] IS NULL
      AND t.tgqual IS NULL
      AND t.tgnargs = 0
      AND t.tgargs = ''::bytea
      AND t.tgconstraint = 0
      AND NOT t.tgdeferrable
      AND NOT t.tginitdeferred
      AND t.tgparentid = 0
      AND t.tgoldtable IS NULL
      AND t.tgnewtable IS NULL
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'Postcheck: triggers de historial/estado no coinciden.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.fotografias'::regclass
      AND c.conname = 'fotografias_id_reporte_key'
      AND c.contype = 'u'
      AND c.convalidated
      AND pg_get_constraintdef(c.oid, true) = 'UNIQUE (id_reporte)'
  ) THEN
    RAISE EXCEPTION 'Postcheck: se perdio UNIQUE(fotografias.id_reporte).';
  END IF;

  SELECT attnum INTO v_location_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.reportes'::regclass
    AND attname = 'id_ubicacion'
    AND NOT attisdropped;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.reportes'::regclass
      AND c.contype = 'u'
      AND c.conkey = ARRAY[v_location_attnum]::smallint[]
  ) OR EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public.reportes'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indnkeyatts = 1
      AND i.indkey[0] = v_location_attnum
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = 'public.reportes'::regclass
          AND c.conindid = i.indexrelid
      )
  ) THEN
    RAISE EXCEPTION 'Postcheck: una UNIQUE puede impedir reutilizar id_ubicacion.';
  END IF;

  FOR r IN
    SELECT i.indexrelid, i.indnkeyatts, i.indkey, i.indexprs,
           pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i
    WHERE i.indrelid = 'public.reportes'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready
  LOOP
    IF r.indnkeyatts = 1 AND r.indkey[0] = v_location_attnum THEN
      RAISE EXCEPTION 'Postcheck: UNIQUE de una sola clave id_ubicacion: %', r.definition;
    END IF;

    IF r.indexprs IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM pg_depend d
         WHERE d.classid = 'pg_class'::regclass
           AND d.objid = r.indexrelid
           AND d.refclassid = 'pg_class'::regclass
           AND d.refobjid = 'public.reportes'::regclass
           AND d.refobjsubid = v_location_attnum
       )
    THEN
      RAISE EXCEPTION 'Postcheck: UNIQUE por expresion depende de id_ubicacion: %',
        r.definition;
    END IF;
  END LOOP;

  IF (SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'public.reportes_publicos'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM ARRAY[
       'id_reporte','id_ubicacion','tipo_problema','descripcion',
       'estado_atencion','fecha_creacion','updated_at'
     ]::text[]
     OR (SELECT array_agg(a.attname::text ORDER BY a.attnum)
         FROM pg_attribute a
         WHERE a.attrelid = 'public.historial_estados_publico'::regclass
           AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM ARRAY[
       'id_historial','id_reporte','estado','fecha_cambio'
     ]::text[]
     OR (SELECT array_agg(format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum)
         FROM pg_attribute a
         WHERE a.attrelid = 'public.reportes_publicos'::regclass
           AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM ARRAY[
       'uuid','uuid','text','text','text','timestamp with time zone','timestamp with time zone'
     ]::text[]
     OR (SELECT array_agg(format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum)
         FROM pg_attribute a
         WHERE a.attrelid = 'public.historial_estados_publico'::regclass
           AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM ARRAY[
       'uuid','uuid','text','timestamp with time zone'
     ]::text[]
     OR (SELECT rtrim(btrim(regexp_replace(pg_get_viewdef('public.reportes_publicos'::regclass, true), '\s+', ' ', 'g')), ';'))
        NOT IN (
          'SELECT r.id_reporte, r.id_ubicacion, r.tipo_problema, r.descripcion, r.estado_atencion, r.fecha_creacion, r.updated_at FROM public.reportes r',
          'SELECT id_reporte, id_ubicacion, tipo_problema, descripcion, estado_atencion, fecha_creacion, updated_at FROM public.reportes r'
        )
     OR (SELECT rtrim(btrim(regexp_replace(pg_get_viewdef('public.historial_estados_publico'::regclass, true), '\s+', ' ', 'g')), ';'))
        NOT IN (
          'SELECT h.id_historial, h.id_reporte, h.estado, h.fecha_cambio FROM public.historial_estados h',
          'SELECT id_historial, id_reporte, estado, fecha_cambio FROM public.historial_estados h'
        )
     OR EXISTS (
       SELECT 1 FROM pg_class c
       WHERE c.oid IN (
         'public.reportes_publicos'::regclass,
         'public.historial_estados_publico'::regclass
       )
         AND c.relkind <> 'v'
     )
  THEN
    RAISE EXCEPTION 'Postcheck: definicion, columnas o tipos de vistas publicas inesperados.';
  END IF;

  IF NOT (
    SELECT reloptions @> ARRAY['security_invoker=true']
    FROM pg_class
    WHERE oid = 'public.reportes_publicos'::regclass
  ) OR NOT (
    SELECT reloptions @> ARRAY['security_invoker=true']
    FROM pg_class
    WHERE oid = 'public.historial_estados_publico'::regclass
  ) THEN
    RAISE EXCEPTION 'Postcheck: las vistas deben usar security_invoker.';
  END IF;

  IF has_table_privilege('anon','public.perfiles','INSERT')
     OR has_table_privilege('authenticated','public.perfiles','INSERT')
     OR has_table_privilege('anon','public.perfiles','UPDATE')
     OR has_table_privilege('authenticated','public.perfiles','UPDATE')
     OR has_table_privilege('anon','public.perfiles','DELETE')
     OR has_table_privilege('authenticated','public.perfiles','DELETE')
     OR has_table_privilege('anon','public.perfiles','TRUNCATE')
     OR has_table_privilege('authenticated','public.perfiles','TRUNCATE')
     OR has_table_privilege('anon','public.perfiles','REFERENCES')
     OR has_table_privilege('authenticated','public.perfiles','REFERENCES')
     OR has_table_privilege('anon','public.perfiles','TRIGGER')
     OR has_table_privilege('authenticated','public.perfiles','TRIGGER')
     OR has_table_privilege('anon','public.perfiles','MAINTAIN')
     OR has_table_privilege('authenticated','public.perfiles','MAINTAIN')
     OR has_table_privilege('anon','public.reportes','INSERT')
     OR has_table_privilege('authenticated','public.reportes','INSERT')
     OR has_table_privilege('anon','public.reportes','UPDATE')
     OR has_table_privilege('authenticated','public.reportes','UPDATE')
     OR has_table_privilege('anon','public.reportes','DELETE')
     OR has_table_privilege('authenticated','public.reportes','DELETE')
     OR has_table_privilege('anon','public.reportes','TRUNCATE')
     OR has_table_privilege('authenticated','public.reportes','TRUNCATE')
     OR has_table_privilege('anon','public.reportes','TRIGGER')
     OR has_table_privilege('authenticated','public.reportes','TRIGGER')
     OR has_table_privilege('anon','public.reportes','REFERENCES')
     OR has_table_privilege('authenticated','public.reportes','REFERENCES')
     OR has_table_privilege('anon','public.reportes','MAINTAIN')
     OR has_table_privilege('authenticated','public.reportes','MAINTAIN')
     OR has_table_privilege('anon','public.ubicaciones','INSERT')
     OR has_table_privilege('authenticated','public.ubicaciones','INSERT')
     OR has_table_privilege('anon','public.ubicaciones','UPDATE')
     OR has_table_privilege('authenticated','public.ubicaciones','UPDATE')
     OR has_table_privilege('anon','public.ubicaciones','DELETE')
     OR has_table_privilege('authenticated','public.ubicaciones','DELETE')
     OR has_table_privilege('anon','public.ubicaciones','TRUNCATE')
     OR has_table_privilege('authenticated','public.ubicaciones','TRUNCATE')
     OR has_table_privilege('anon','public.ubicaciones','REFERENCES')
     OR has_table_privilege('authenticated','public.ubicaciones','REFERENCES')
     OR has_table_privilege('anon','public.ubicaciones','TRIGGER')
     OR has_table_privilege('authenticated','public.ubicaciones','TRIGGER')
     OR has_table_privilege('anon','public.ubicaciones','MAINTAIN')
     OR has_table_privilege('authenticated','public.ubicaciones','MAINTAIN')
     OR has_table_privilege('anon','public.fotografias','INSERT')
     OR has_table_privilege('authenticated','public.fotografias','INSERT')
     OR has_table_privilege('anon','public.fotografias','UPDATE')
     OR has_table_privilege('authenticated','public.fotografias','UPDATE')
     OR has_table_privilege('anon','public.fotografias','DELETE')
     OR has_table_privilege('authenticated','public.fotografias','DELETE')
     OR has_table_privilege('anon','public.fotografias','TRUNCATE')
     OR has_table_privilege('authenticated','public.fotografias','TRUNCATE')
     OR has_table_privilege('anon','public.fotografias','REFERENCES')
     OR has_table_privilege('authenticated','public.fotografias','REFERENCES')
     OR has_table_privilege('anon','public.fotografias','TRIGGER')
     OR has_table_privilege('authenticated','public.fotografias','TRIGGER')
     OR has_table_privilege('anon','public.fotografias','MAINTAIN')
     OR has_table_privilege('authenticated','public.fotografias','MAINTAIN')
     OR has_table_privilege('anon','public.historial_estados','INSERT')
     OR has_table_privilege('authenticated','public.historial_estados','INSERT')
     OR has_table_privilege('anon','public.historial_estados','UPDATE')
     OR has_table_privilege('authenticated','public.historial_estados','UPDATE')
     OR has_table_privilege('anon','public.historial_estados','DELETE')
     OR has_table_privilege('authenticated','public.historial_estados','DELETE')
     OR has_table_privilege('anon','public.historial_estados','TRUNCATE')
     OR has_table_privilege('authenticated','public.historial_estados','TRUNCATE')
     OR has_table_privilege('anon','public.historial_estados','REFERENCES')
     OR has_table_privilege('authenticated','public.historial_estados','REFERENCES')
     OR has_table_privilege('anon','public.historial_estados','TRIGGER')
     OR has_table_privilege('authenticated','public.historial_estados','TRIGGER')
     OR has_table_privilege('anon','public.historial_estados','MAINTAIN')
     OR has_table_privilege('authenticated','public.historial_estados','MAINTAIN')
     OR has_table_privilege('authenticated','storage.objects','TRUNCATE')
     OR has_table_privilege('anon','storage.objects','TRUNCATE')
     OR has_table_privilege('authenticated','storage.objects','REFERENCES')
     OR has_table_privilege('anon','storage.objects','REFERENCES')
     OR has_table_privilege('authenticated','storage.objects','TRIGGER')
     OR has_table_privilege('anon','storage.objects','TRIGGER')
     OR has_table_privilege('authenticated','storage.objects','MAINTAIN')
     OR has_table_privilege('anon','storage.objects','MAINTAIN')
     OR NOT has_table_privilege('authenticated','storage.objects','SELECT')
     OR NOT has_table_privilege('authenticated','storage.objects','INSERT')
     OR NOT has_table_privilege('service_role','storage.objects','SELECT')
     OR NOT has_table_privilege('service_role','storage.objects','DELETE')
     OR has_table_privilege('anon','public.perfiles','SELECT')
     OR NOT has_table_privilege('authenticated','public.perfiles','SELECT')
     OR NOT has_table_privilege('anon','public.ubicaciones','SELECT')
     OR NOT has_table_privilege('authenticated','public.ubicaciones','SELECT')
     OR NOT has_table_privilege('anon','public.reportes_publicos','SELECT')
     OR NOT has_table_privilege('authenticated','public.reportes_publicos','SELECT')
     OR NOT has_table_privilege('anon','public.historial_estados_publico','SELECT')
     OR NOT has_table_privilege('authenticated','public.historial_estados_publico','SELECT')
     OR has_column_privilege('anon','public.reportes','id_usuario','SELECT')
     OR has_column_privilege('authenticated','public.reportes','id_usuario','SELECT')
     OR has_column_privilege('anon','public.historial_estados','observacion','SELECT')
     OR has_column_privilege('authenticated','public.historial_estados','observacion','SELECT')
     OR has_column_privilege('anon','public.historial_estados','id_administrador','SELECT')
     OR has_column_privilege('authenticated','public.historial_estados','id_administrador','SELECT')
     OR has_column_privilege('authenticated','public.perfiles','rol','UPDATE')
     OR has_column_privilege('anon','public.perfiles','id_usuario','UPDATE')
     OR has_column_privilege('anon','public.perfiles','rol','UPDATE')
     OR has_column_privilege('authenticated','public.perfiles','fecha_registro','UPDATE')
     OR has_column_privilege('authenticated','public.perfiles','id_usuario','UPDATE')
     OR has_column_privilege('anon','public.perfiles','fecha_registro','UPDATE')
     OR has_column_privilege('anon','public.perfiles','nombre_completo','UPDATE')
     OR has_column_privilege('anon','public.perfiles','telefono','UPDATE')
     OR NOT has_column_privilege('authenticated','public.perfiles','nombre_completo','UPDATE')
     OR NOT has_column_privilege('authenticated','public.perfiles','telefono','UPDATE')
  THEN
    RAISE EXCEPTION 'Postcheck: persisten privilegios publicos sobre operaciones/datos privados.';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'Postcheck: matriz EXECUTE de crear_reporte_completo incorrecta.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (
      'public.es_administrador()'::regprocedure,
      'public.asignar_rol_perfil(uuid,text)'::regprocedure,
      'public.actualizar_estado_reporte(uuid,text,text)'::regprocedure,
      'public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)'::regprocedure,
      'public.mis_reportes()'::regprocedure,
      'public.consultar_identidad_reportante(uuid)'::regprocedure
    )
      AND (
        NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (
      'public.crear_perfil_usuario()'::regprocedure,
      'public.proteger_rol_perfil()'::regprocedure,
      'public.proteger_eliminacion_ultimo_administrador()'::regprocedure,
      'public.registrar_estado_inicial()'::regprocedure,
      'public.registrar_cambio_estado()'::regprocedure,
      'public.handle_new_auth_user()'::regprocedure,
      'public.handle_new_user()'::regprocedure
    )
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'Postcheck: privilegios EXECUTE efectivos inesperados.';
  END IF;

  IF EXISTS (
    WITH expected_functions(function_oid, allowed_grantee) AS (
      VALUES
        ('public.es_administrador()'::regprocedure::oid, 'authenticated'::regrole::oid),
        ('public.asignar_rol_perfil(uuid,text)'::regprocedure::oid, 'authenticated'::regrole::oid),
        ('public.actualizar_estado_reporte(uuid,text,text)'::regprocedure::oid, 'authenticated'::regrole::oid),
        ('public.crear_reporte_completo(uuid,text,text,text,numeric,numeric,text,uuid)'::regprocedure::oid, 'authenticated'::regrole::oid),
        ('public.mis_reportes()'::regprocedure::oid, 'authenticated'::regrole::oid),
        ('public.consultar_identidad_reportante(uuid)'::regprocedure::oid, 'authenticated'::regrole::oid),
        ('public.mi_calle_ruta_fotografia_reservada(text)'::regprocedure::oid, 'authenticated'::regrole::oid),
        ('public.mi_calle_inspeccionar_creacion_reporte(uuid,text)'::regprocedure::oid, 'service_role'::regrole::oid),
        ('public.mi_calle_reservar_limpieza_fotografia(text,uuid)'::regprocedure::oid, 'service_role'::regrole::oid),
        ('public.mi_calle_finalizar_limpieza_fotografia(text)'::regprocedure::oid, 'service_role'::regrole::oid),
        ('public.mi_calle_registrar_error_limpieza_fotografia(text,text)'::regprocedure::oid, 'service_role'::regrole::oid),
        ('public.mi_calle_reclamar_fotografias_huerfanas(integer)'::regprocedure::oid, 'service_role'::regrole::oid),
        ('public.mi_calle_pendientes_limpieza_fotografias(integer)'::regprocedure::oid, 'service_role'::regrole::oid),
        ('public.crear_perfil_usuario()'::regprocedure::oid, NULL::oid),
        ('public.proteger_rol_perfil()'::regprocedure::oid, NULL::oid),
        ('public.proteger_eliminacion_ultimo_administrador()'::regprocedure::oid, NULL::oid),
        ('public.registrar_estado_inicial()'::regprocedure::oid, NULL::oid),
        ('public.registrar_cambio_estado()'::regprocedure::oid, NULL::oid),
        ('public.handle_new_auth_user()'::regprocedure::oid, NULL::oid),
        ('public.handle_new_user()'::regprocedure::oid, NULL::oid)
    ),
    expanded_acl AS (
      SELECT e.function_oid,
             e.allowed_grantee,
             p.proowner,
             acl.grantee,
             acl.privilege_type,
             acl.is_grantable
      FROM expected_functions e
      JOIN pg_proc p ON p.oid = e.function_oid
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS acl
    ),
    violations AS (
      SELECT 1
      FROM expected_functions e
      JOIN pg_proc p ON p.oid = e.function_oid
      WHERE p.proowner <> 'postgres'::regrole::oid

      UNION ALL

      SELECT 1
      FROM expanded_acl a
      WHERE a.grantee <> a.proowner
        AND (
          a.allowed_grantee IS NULL
          OR a.grantee <> a.allowed_grantee
          OR a.privilege_type <> 'EXECUTE'
          OR a.is_grantable
        )

      UNION ALL

      SELECT 1
      FROM expected_functions e
      WHERE e.allowed_grantee IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM expanded_acl a
          WHERE a.function_oid = e.function_oid
            AND a.grantee = e.allowed_grantee
            AND a.privilege_type = 'EXECUTE'
            AND NOT a.is_grantable
        )
    )
    SELECT 1
    FROM violations
  ) THEN
    RAISE EXCEPTION 'Postcheck: ACL directa o GRANT OPTION de funciones inesperados.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'reportes'
      AND name = 'reportes'
      AND public IS TRUE
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
  ) THEN
    RAISE EXCEPTION 'Postcheck: bucket reportes no tiene configuracion aprobada.';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados');
  IF v_policy_count <> 6
     OR EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')
         AND policyname NOT IN (
           'Consultar perfiles propios o administrativos',
           'Actualizar perfil propio',
           'Consultar reportes publicos',
           'Consultar ubicaciones publicas',
           'Consultar fotografias publicas',
           'Consultar historial publico'
         )
     )
  THEN
    RAISE EXCEPTION 'Postcheck: policies publicas inesperadas.';
  END IF;

  PERFORM set_config('search_path', v_orig_search_path, true);

  IF EXISTS (
    WITH expected(schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check) AS (
      VALUES
        ('public','perfiles','Consultar perfiles propios o administrativos','PERMISSIVE',
         ARRAY['authenticated']::name[],'SELECT',
         '((id_usuario = ( SELECT auth.uid() AS uid)) OR ( SELECT es_administrador() AS es_administrador))',NULL::text),
        ('public','perfiles','Actualizar perfil propio','PERMISSIVE',
         ARRAY['authenticated']::name[],'UPDATE',
         '(id_usuario = ( SELECT auth.uid() AS uid))',
         '(id_usuario = ( SELECT auth.uid() AS uid))'),
        ('public','reportes','Consultar reportes publicos','PERMISSIVE',
         ARRAY['anon','authenticated']::name[],'SELECT','true',NULL::text),
        ('public','ubicaciones','Consultar ubicaciones publicas','PERMISSIVE',
         ARRAY['anon','authenticated']::name[],'SELECT','true',NULL::text),
        ('public','fotografias','Consultar fotografias publicas','PERMISSIVE',
         ARRAY['anon','authenticated']::name[],'SELECT','true',NULL::text),
        ('public','historial_estados','Consultar historial publico','PERMISSIVE',
         ARRAY['anon','authenticated']::name[],'SELECT','true',NULL::text)
    ),
    actual AS (
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('perfiles','reportes','ubicaciones','fotografias','historial_estados')
    )
    SELECT 1
    FROM expected e
    FULL JOIN actual a USING (schemaname, tablename, policyname)
    WHERE e.policyname IS NULL OR a.policyname IS NULL
       OR e.permissive IS DISTINCT FROM a.permissive
       OR e.roles IS DISTINCT FROM a.roles
       OR e.cmd IS DISTINCT FROM a.cmd
       OR e.qual IS DISTINCT FROM a.qual
       OR e.with_check IS DISTINCT FROM a.with_check
  ) THEN
    RAISE EXCEPTION 'Postcheck: las expresiones o roles de policies publicas difieren del contrato.';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects') <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = 'Subida autenticada con ruta Mi Calle'
         AND permissive = 'PERMISSIVE'
         AND roles = ARRAY['authenticated']::name[]
         AND cmd = 'INSERT'
         AND qual IS NULL
         AND btrim(regexp_replace(with_check, '\s+', ' ', 'g')) = btrim(v_expected_storage_check)
     )
  THEN
    RAISE EXCEPTION 'Postcheck: policies Storage adicionales o faltantes.';
  END IF;
END;
$postcheck$;

COMMIT;
