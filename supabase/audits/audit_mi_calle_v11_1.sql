-- Mi Calle V11.1 - auditoria independiente SELECT-only.
-- No contiene DDL/DML, llamadas de escritura, SET ni operaciones de Storage.
-- Ejecutar por separado de cualquier migracion y revisar los resultados.

-- 1. Contexto de base y version.
SELECT current_database() AS database_name,
       session_user AS session_role,
       current_user AS effective_role,
       current_setting('role', true) AS role_guc,
       current_setting('transaction_isolation') AS transaction_isolation,
       current_setting('mi_calle.bootstrap_first_admin', true) AS bootstrap_guc,
       auth.uid() AS auth_uid,
       auth.role() AS auth_role,
       version() AS postgres_version;

-- 2. Columnas, tipos, nullabilidad y defaults de las cinco tablas aprobadas.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       a.attnum AS ordinal,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null,
       pg_get_expr(d.adbin, d.adrelid) AS default_expression,
       a.attidentity AS identity_kind,
       a.attgenerated AS generated_kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relname IN (
    'perfiles','reportes','ubicaciones','fotografias','historial_estados',
    'mi_calle_limpieza_fotografias'
  )
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

-- 3. PK, FK, UNIQUE, CHECK, estado de validacion y reglas ON DELETE/UPDATE.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       con.convalidated AS is_validated,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'perfiles','reportes','ubicaciones','fotografias','historial_estados',
    'mi_calle_limpieza_fotografias'
  )
ORDER BY c.relname, con.contype, con.conname;

-- 4. Indices UNIQUE de reportes. Distingue columnas clave de INCLUDE,
-- indice parcial, expresiones, validez y disponibilidad.
SELECT i.indexrelid::regclass AS index_name,
       i.indisunique AS is_unique,
       i.indisvalid AS is_valid,
       i.indisready AS is_ready,
       i.indnkeyatts AS key_column_count,
       i.indnatts AS key_and_include_column_count,
       i.indkey AS attribute_numbers,
       i.indpred IS NOT NULL AS is_partial,
       i.indexprs IS NOT NULL AS has_expressions,
       pg_get_indexdef(i.indexrelid) AS definition,
       EXISTS (
         SELECT 1
         FROM pg_constraint con
         WHERE con.conrelid = i.indrelid
           AND con.conindid = i.indexrelid
       ) AS backs_constraint
FROM pg_index i
WHERE i.indrelid = 'public.reportes'::regclass
  AND i.indisunique
ORDER BY i.indexrelid::regclass::text;

-- 5. RLS de las tablas de Mi Calle y Storage.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname = 'public'
       AND c.relname IN (
         'perfiles','reportes','ubicaciones','fotografias','historial_estados',
         'mi_calle_limpieza_fotografias'
       ))
   OR (n.nspname = 'storage' AND c.relname = 'objects')
ORDER BY n.nspname, c.relname;

-- 6. Todas las policies de las cinco tablas y storage.objects.
SELECT schemaname,
       tablename,
       policyname,
       permissive,
       roles,
       cmd,
       qual AS using_expression,
       with_check AS check_expression
FROM pg_policies
WHERE (schemaname = 'public'
       AND tablename IN (
         'perfiles','reportes','ubicaciones','fotografias','historial_estados',
         'mi_calle_limpieza_fotografias'
       ))
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- 7. Triggers de aplicacion e internos en auth.users y tablas Mi Calle.
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'storage'
  AND table_name = 'objects'
  AND column_name IN ('bucket_id','name','owner_id','metadata','created_at')
ORDER BY ordinal_position;

SELECT n.nspname AS table_schema,
       c.relname AS table_name,
       t.tgname AS trigger_name,
       t.tgisinternal AS is_internal,
       t.tgtype AS trigger_type_bits,
       t.tgenabled AS enabled_state,
       pn.nspname AS function_schema,
       p.proname AS function_name,
       pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE (n.nspname = 'auth' AND c.relname = 'users')
   OR (n.nspname = 'public'
       AND c.relname IN (
         'perfiles','reportes','ubicaciones','fotografias','historial_estados',
         'mi_calle_limpieza_fotografias'
       ))
   OR (n.nspname = 'storage' AND c.relname = 'objects')
ORDER BY n.nspname, c.relname, t.tgisinternal, t.tgname;

-- 8. Definiciones y atributos de funciones relacionadas con Auth, roles,
-- reportes e historial. No consulta filas de usuarios.
SELECT n.nspname AS function_schema,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_userbyid(p.proowner) AS owner_name,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       p.proconfig AS function_configuration,
       p.proacl AS execute_acl,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'handle_new_auth_user','crear_perfil_usuario','handle_new_user',
    'es_administrador','proteger_rol_perfil','asignar_rol_perfil',
    'registrar_estado_inicial','registrar_cambio_estado',
    'actualizar_estado_reporte','crear_reporte_completo','mis_reportes',
    'consultar_identidad_reportante','mi_calle_ruta_fotografia_reservada',
    'mi_calle_inspeccionar_creacion_reporte','mi_calle_reservar_limpieza_fotografia',
    'mi_calle_finalizar_limpieza_fotografia','mi_calle_registrar_error_limpieza_fotografia',
    'mi_calle_reclamar_fotografias_huerfanas','mi_calle_pendientes_limpieza_fotografias'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- 9. Vistas publicas, columnas, security_invoker y dependencias catalogadas.
SELECT n.nspname AS schema_name,
       c.relname AS view_name,
       c.relkind AS relation_kind,
       c.reloptions AS view_options,
       a.attnum AS ordinal,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attribute a
  ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
  AND c.relname IN ('reportes_publicos','historial_estados_publico')
ORDER BY c.relname, a.attnum;

SELECT d.refobjid::regclass AS referenced_view,
       d.classid::regclass AS dependent_catalog,
       d.objid,
       d.objsubid,
       d.deptype
FROM pg_depend d
WHERE d.refclassid = 'pg_class'::regclass
  AND d.refobjid IN (
    to_regclass('public.reportes_publicos'),
    to_regclass('public.historial_estados_publico')
  )
ORDER BY d.refobjid::regclass::text, d.classid::regclass::text, d.objid;

-- 10. ACL directas de tablas Mi Calle y storage.objects.
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       pg_get_userbyid(c.relowner) AS owner_name,
       acl.grantee,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(acl.grantee) END AS grantee_name,
       acl.privilege_type,
       acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
WHERE (n.nspname = 'public'
       AND c.relname IN (
         'perfiles','reportes','ubicaciones','fotografias','historial_estados',
         'mi_calle_limpieza_fotografias'
       ))
   OR (n.nspname = 'storage' AND c.relname = 'objects')
ORDER BY n.nspname, c.relname, grantee_name, acl.privilege_type;

-- 11. ACL explicitas por columna.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       a.attname AS column_name,
       acl.grantee,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(acl.grantee) END AS grantee_name,
       acl.privilege_type,
       acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
CROSS JOIN LATERAL aclexplode(a.attacl) acl
WHERE ((n.nspname = 'public'
        AND c.relname IN (
          'perfiles','reportes','ubicaciones','fotografias','historial_estados',
          'mi_calle_limpieza_fotografias'
        ))
    OR (n.nspname = 'storage' AND c.relname = 'objects'))
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum, grantee_name, acl.privilege_type;

-- 12. Privilegios efectivos seleccionados para roles de aplicacion y plataforma.
WITH principals(role_name) AS (
  SELECT rolname FROM pg_roles
),
targets(relation_name) AS (
  VALUES ('public.perfiles'), ('public.reportes'), ('public.ubicaciones'),
         ('public.fotografias'), ('public.historial_estados'),
         ('public.mi_calle_limpieza_fotografias'), ('storage.objects')
),
privileges(privilege_name) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
         ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
)
SELECT principals.role_name,
       targets.relation_name,
       privileges.privilege_name,
       CASE
         WHEN to_regclass(targets.relation_name) IS NOT NULL
           THEN has_table_privilege(
             principals.role_name,
             targets.relation_name,
             privileges.privilege_name
           )
         ELSE NULL
       END AS effective_privilege
FROM principals
CROSS JOIN targets
CROSS JOIN privileges
WHERE EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = principals.role_name)
ORDER BY principals.role_name, targets.relation_name, privileges.privilege_name;

-- 13. Columnas privadas y grants esperados. Mantener el resultado para revisar.
SELECT role_name,
       has_column_privilege(role_name, 'public.reportes', 'id_usuario', 'SELECT')
         AS can_select_report_user_id,
       has_column_privilege(role_name, 'public.historial_estados', 'observacion', 'SELECT')
         AS can_select_history_observation,
       has_column_privilege(role_name, 'public.historial_estados', 'id_administrador', 'SELECT')
         AS can_select_admin_id,
       has_column_privilege(role_name, 'public.perfiles', 'rol', 'UPDATE')
         AS can_update_profile_role,
       has_column_privilege(role_name, 'public.perfiles', 'nombre_completo', 'UPDATE')
         AS can_update_profile_name,
       has_column_privilege(role_name, 'public.perfiles', 'telefono', 'UPDATE')
         AS can_update_profile_phone
FROM (VALUES ('anon'::text), ('authenticated'::text)) AS roles(role_name)
ORDER BY role_name;

-- 14. Roles, atributos y membresias que pueden otorgar privilegios heredados.
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolbypassrls, rolcanlogin
FROM pg_roles
ORDER BY rolname;

SELECT parent.rolname AS granted_role,
       member.rolname AS member_role,
       m.admin_option,
       m.inherit_option,
       m.set_option
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
ORDER BY parent.rolname, member.rolname;

-- 15. Bucket y policies Storage. No enumera objetos ni nombres de archivo.
-- El contrato V11 admitido por la policy y la RPC es
-- evidencias/<UUID aleatorio>.(jpg|png|webp), con MIME image/jpeg,
-- image/png o image/webp y máximo 5242880 bytes.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'reportes';

SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_expression, with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;

-- 16. RPC: EXECUTE efectivo y atributos SECURITY DEFINER.
SELECT p.oid::regprocedure AS function_signature,
       pg_get_userbyid(p.proowner) AS owner_name,
       p.prosecdef AS security_definer,
       p.proconfig AS function_configuration,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
       p.proacl AS execute_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'es_administrador','proteger_rol_perfil','asignar_rol_perfil',
    'actualizar_estado_reporte','crear_reporte_completo','mis_reportes',
    'consultar_identidad_reportante','mi_calle_ruta_fotografia_reservada',
    'mi_calle_inspeccionar_creacion_reporte','mi_calle_reservar_limpieza_fotografia',
    'mi_calle_finalizar_limpieza_fotografia','mi_calle_registrar_error_limpieza_fotografia',
    'mi_calle_reclamar_fotografias_huerfanas','mi_calle_pendientes_limpieza_fotografias',
    'crear_perfil_usuario',
    'registrar_estado_inicial','registrar_cambio_estado'
  )
ORDER BY p.proname, p.oid::regprocedure::text;

-- Privilegios efectivos por función para todos los roles; revisar herencia
-- junto con el inventario completo de pg_auth_members anterior.
SELECT r.rolname AS role_name,
       p.oid::regprocedure AS function_signature,
       has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
FROM pg_roles r
CROSS JOIN pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'crear_perfil_usuario','registrar_estado_inicial','registrar_cambio_estado',
    'actualizar_estado_reporte','crear_reporte_completo','mis_reportes',
    'consultar_identidad_reportante','mi_calle_ruta_fotografia_reservada',
    'mi_calle_inspeccionar_creacion_reporte','mi_calle_reservar_limpieza_fotografia',
    'mi_calle_finalizar_limpieza_fotografia','mi_calle_registrar_error_limpieza_fotografia',
    'mi_calle_reclamar_fotografias_huerfanas','mi_calle_pendientes_limpieza_fotografias'
  )
ORDER BY r.rolname, p.oid::regprocedure::text;

-- 17. Definiciones completas de las vistas publicas para validar origen,
-- expresiones, relaciones y columnas sin ejecutar consultas de negocio.
SELECT n.nspname AS schema_name,
       c.relname AS view_name,
       c.reloptions AS options,
       pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reportes_publicos','historial_estados_publico')
  AND c.relkind IN ('v','m')
ORDER BY c.relname;

-- 18. Atributos exactos de triggers no internos. tgtype permite decodificar
-- orientacion, evento y nivel fila/statement; tgattr muestra UPDATE OF.
SELECT n.nspname AS table_schema,
       c.relname AS table_name,
       t.tgname AS trigger_name,
       pn.nspname AS function_schema,
       p.proname AS function_name,
       t.tgtype AS trigger_type_bits,
       t.tgattr AS update_columns_vector,
       t.tgattr::text AS update_columns_text,
       t.tgattr[0] AS update_column_0,
       t.tgattr[1] AS update_column_1,
       t.tgenabled AS enabled_state,
       t.tgqual IS NOT NULL AS has_when_clause,
       t.tgnargs AS argument_count,
       encode(t.tgargs, 'escape') AS trigger_arguments,
       t.tgconstraint AS constraint_oid,
       t.tgdeferrable AS is_deferrable,
       t.tginitdeferred AS initially_deferred,
       t.tgparentid AS parent_trigger_oid,
       t.tgoldtable AS old_transition_table,
       t.tgnewtable AS new_transition_table,
       pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND ((n.nspname = 'auth' AND c.relname = 'users')
    OR (n.nspname = 'public'
        AND c.relname IN (
          'perfiles','reportes','ubicaciones','fotografias','historial_estados',
          'mi_calle_limpieza_fotografias'
        )))
ORDER BY n.nspname, c.relname, t.tgname;

-- 19. Privilegios efectivos de Storage: anon/authenticated no deben listar
-- objetos por tabla; service_role requiere DELETE para cleanup del servidor.
SELECT role_name,
       has_table_privilege(role_name, 'storage.objects', 'SELECT') AS can_select_storage_objects,
       has_table_privilege(role_name, 'storage.objects', 'INSERT') AS can_upload,
       has_table_privilege(role_name, 'storage.objects', 'UPDATE') AS can_update,
       has_table_privilege(role_name, 'storage.objects', 'DELETE') AS can_delete
FROM (VALUES ('anon'::text), ('authenticated'::text), ('service_role'::text)) AS roles(role_name)
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
ORDER BY role_name;
