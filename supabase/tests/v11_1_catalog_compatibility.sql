-- Probe reproducible para PostgreSQL 17.11 en una rama/proyecto desechable
-- con la propuesta V11.1 ya aplicada. No hace INSERT/UPDATE/DELETE.
-- Todo DDL de prueba se revierte al final con ROLLBACK.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'Este probe requiere PostgreSQL 17.x.';
  END IF;
  IF to_regnamespace('mi_calle_v11_1_probe') IS NOT NULL THEN
    RAISE EXCEPTION 'El schema de probe ya existe; no se reutiliza.';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('public.mi_calle_ruta_fotografia_reservada(text)') IS NULL
  THEN
    RAISE EXCEPTION 'Ejecute el probe en una rama Supabase con V11.1 aplicada.';
  END IF;
END;
$guard$;

CREATE SCHEMA mi_calle_v11_1_probe;

CREATE TABLE mi_calle_v11_1_probe.storage_objects (
  bucket_id text,
  owner_id text,
  name text,
  metadata jsonb
);
ALTER TABLE mi_calle_v11_1_probe.storage_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Probe V11.1 Storage insert"
ON mi_calle_v11_1_probe.storage_objects FOR INSERT TO authenticated
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

CREATE TABLE mi_calle_v11_1_probe.trigger_probe (
  id integer,
  estado text
);

CREATE FUNCTION mi_calle_v11_1_probe.noop_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE TRIGGER probe_insert
AFTER INSERT ON mi_calle_v11_1_probe.trigger_probe
FOR EACH ROW EXECUTE FUNCTION mi_calle_v11_1_probe.noop_trigger();

CREATE TRIGGER probe_update_of
AFTER UPDATE OF estado ON mi_calle_v11_1_probe.trigger_probe
FOR EACH ROW EXECUTE FUNCTION mi_calle_v11_1_probe.noop_trigger();

DO $assertions$
DECLARE
  v_actual text;
  v_expected text;
  v_state_attnum smallint;
BEGIN
  v_expected := regexp_replace($expected$
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
      AND (NOT public.mi_calle_ruta_fotografia_reservada(name)))
  $expected$, '\s+', ' ', 'g');

  SELECT regexp_replace(with_check, '\s+', ' ', 'g')
  INTO v_actual
  FROM pg_policies
  WHERE schemaname = 'mi_calle_v11_1_probe'
    AND tablename = 'storage_objects'
    AND policyname = 'Probe V11.1 Storage insert';

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'El deparser de policy Storage no coincide. Actual: %', v_actual;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'mi_calle_v11_1_probe'
      AND tablename = 'storage_objects'
      AND policyname = 'Probe V11.1 Storage insert'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'INSERT'
      AND qual IS NULL
  ) THEN
    RAISE EXCEPTION 'Los atributos de la policy Storage no coinciden.';
  END IF;

  SELECT a.attnum INTO v_state_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'mi_calle_v11_1_probe.trigger_probe'::regclass
    AND a.attname = 'estado';

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'mi_calle_v11_1_probe.trigger_probe'::regclass
      AND t.tgname = 'probe_insert'
      AND t.tgattr[0] IS NULL
      AND t.tgattr[1] IS NULL
  ) THEN
    RAISE EXCEPTION 'La lectura de tgattr vacio no coincide con lo esperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'mi_calle_v11_1_probe.trigger_probe'::regclass
      AND t.tgname = 'probe_update_of'
      AND t.tgattr[0] = v_state_attnum
      AND t.tgattr[1] IS NULL
  ) THEN
    RAISE EXCEPTION 'La lectura de tgattr para UPDATE OF no coincide.';
  END IF;
END;
$assertions$;

SELECT t.tgname,
       t.tgattr AS tgattr_vector,
       t.tgattr::text AS tgattr_text,
       t.tgattr[0] AS first_column_attnum,
       t.tgattr[1] AS second_column_attnum
FROM pg_trigger t
WHERE t.tgrelid = 'mi_calle_v11_1_probe.trigger_probe'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

SELECT schemaname, tablename, policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'mi_calle_v11_1_probe'
ORDER BY policyname;

ROLLBACK;
