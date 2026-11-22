BEGIN;

-- 1. Ampliar los CHECK constraints para incluir 'descartado'
ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_estado_atencion_check,
  ADD CONSTRAINT reportes_estado_atencion_check
    CHECK (estado_atencion = ANY (ARRAY['pendiente'::text, 'en_revision'::text, 'en_proceso'::text, 'reparado'::text, 'descartado'::text]));

ALTER TABLE public.historial_estados
  DROP CONSTRAINT IF EXISTS historial_estados_estado_check,
  ADD CONSTRAINT historial_estados_estado_check
    CHECK (estado = ANY (ARRAY['pendiente'::text, 'en_revision'::text, 'en_proceso'::text, 'reparado'::text, 'descartado'::text]));

-- 2. Columna para registrar cuándo fue descartado el reporte (para borrado diferido a 24h)
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS descartado_en timestamptz NULL;

-- 3. Trigger para gestionar descartado_en y seguir registrando historial
CREATE OR REPLACE FUNCTION public.registrar_cambio_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.estado_atencion IS DISTINCT FROM NEW.estado_atencion THEN
    IF NEW.estado_atencion = 'descartado' THEN
      NEW.descartado_en = COALESCE(NEW.descartado_en, NOW());
    ELSE
      NEW.descartado_en = NULL;
    END IF;

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
END;
$function$;

-- 4. Ocultar reportes descartados de la vista pública (mapa público)
CREATE OR REPLACE VIEW public.reportes_publicos
WITH (security_invoker = true)
AS
SELECT r.id_reporte, r.id_ubicacion, r.tipo_problema,
       r.descripcion, r.estado_atencion, r.fecha_creacion, r.updated_at
FROM public.reportes AS r
WHERE r.estado_atencion <> 'descartado';

-- 5. Función de purga automática para reportes descartados con más de 24 horas
CREATE OR REPLACE FUNCTION public.purgar_reportes_descartados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_eliminados integer := 0;
BEGIN
  WITH objetivo AS (
    SELECT r.id_reporte, r.id_ubicacion, f.storage_path
    FROM public.reportes r
    LEFT JOIN public.fotografias f ON f.id_reporte = r.id_reporte
    WHERE r.estado_atencion = 'descartado'
      AND r.descartado_en IS NOT NULL
      AND r.descartado_en <= NOW() - INTERVAL '24 hours'
  ),
  marcar_limpieza AS (
    INSERT INTO public.mi_calle_limpieza_fotografias (storage_path, id_reporte, estado, actualizado_en)
    SELECT o.storage_path, o.id_reporte, 'pendiente', NOW()
    FROM objetivo o
    WHERE o.storage_path IS NOT NULL
    ON CONFLICT (storage_path) DO NOTHING
  ),
  borrar_reportes AS (
    DELETE FROM public.reportes r
    USING objetivo o
    WHERE r.id_reporte = o.id_reporte
    RETURNING o.id_ubicacion
  ),
  borrar_ubicaciones AS (
    DELETE FROM public.ubicaciones u
    WHERE u.id_ubicacion IN (SELECT id_ubicacion FROM borrar_reportes WHERE id_ubicacion IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.reportes r2 WHERE r2.id_ubicacion = u.id_ubicacion)
  )
  SELECT COUNT(*) INTO v_eliminados FROM borrar_reportes;

  RETURN v_eliminados;
END;
$function$;

COMMIT;

-- 

CREATE OR REPLACE FUNCTION public.actualizar_estado_reporte(
  p_id_reporte uuid,
  p_estado text,
  p_observacion text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF p_id_reporte IS NULL
     OR p_estado IS NULL
     OR p_estado NOT IN ('pendiente', 'en_revision', 'en_proceso', 'reparado', 'descartado')
  THEN
    RAISE EXCEPTION 'Reporte o estado no valido.';
  END IF;

  IF p_estado = 'descartado' AND NULLIF(btrim(COALESCE(p_observacion, '')), '') IS NULL THEN
    RAISE EXCEPTION 'La observacion es obligatoria para descartar un reporte.';
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