BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_cambio_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_administrador uuid := (SELECT auth.uid());
  v_observacion text;
BEGIN
  IF OLD.estado_atencion IS DISTINCT FROM NEW.estado_atencion THEN
    IF v_administrador IS NULL THEN
      RAISE EXCEPTION 'El cambio de estado requiere una sesion autenticada.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.perfiles
      WHERE id_usuario = v_administrador
        AND rol = 'administrador'
    ) THEN
      RAISE EXCEPTION 'El cambio de estado debe realizarlo un administrador.';
    END IF;

    v_observacion := NULLIF(
      BTRIM(COALESCE(current_setting('app.mi_calle_observacion', true), '')),
      ''
    );
    IF v_observacion IS NULL THEN
      RAISE EXCEPTION 'La observacion es obligatoria para cualquier cambio de estado.';
    END IF;

    IF NEW.estado_atencion = 'descartado' THEN
      NEW.descartado_en := COALESCE(NEW.descartado_en, NOW());
    ELSE
      NEW.descartado_en := NULL;
    END IF;

    INSERT INTO public.historial_estados (
      id_reporte,
      id_administrador,
      estado,
      observacion
    )
    VALUES (
      NEW.id_reporte,
      v_administrador,
      NEW.estado_atencion,
      v_observacion
    );

    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.actualizar_estado_reporte(
  p_id_reporte uuid,
  p_estado text,
  p_observacion text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_estado_actual text;
  v_observacion text := NULLIF(BTRIM(COALESCE(p_observacion, '')), '');
BEGIN
  IF p_id_reporte IS NULL
     OR p_estado IS NULL
     OR p_estado NOT IN ('pendiente', 'en_revision', 'en_proceso', 'reparado', 'descartado')
  THEN
    RAISE EXCEPTION 'Reporte o estado no valido.';
  END IF;

  IF v_observacion IS NULL THEN
    RAISE EXCEPTION 'La observacion es obligatoria para cualquier cambio de estado.';
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'La actualizacion requiere aislamiento READ COMMITTED.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mi_calle:asignacion_rol', 0));

  v_actor := (SELECT auth.uid());
  IF v_actor IS NULL OR NOT public.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador autenticado puede actualizar reportes.';
  END IF;

  SELECT r.estado_atencion
  INTO v_estado_actual
  FROM public.reportes AS r
  WHERE r.id_reporte = p_id_reporte
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte no encontrado.';
  END IF;

  IF v_estado_actual = p_estado THEN
    RAISE EXCEPTION 'Selecciona un estado distinto para registrar una nueva observacion.';
  END IF;

  PERFORM set_config('app.mi_calle_observacion', v_observacion, true);

  UPDATE public.reportes
  SET estado_atencion = p_estado
  WHERE id_reporte = p_id_reporte;
END;
$function$;

COMMIT;
