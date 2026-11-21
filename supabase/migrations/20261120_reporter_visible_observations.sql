BEGIN;

CREATE OR REPLACE FUNCTION public.consultar_historial_reportes(p_id_reportes uuid[])
RETURNS TABLE (
  id_reporte uuid,
  id_historial uuid,
  estado text,
  fecha_cambio timestamptz,
  observacion text
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
  SELECT h.id_reporte, h.id_historial, h.estado, h.fecha_cambio, h.observacion
  FROM public.historial_estados h
  JOIN public.reportes r ON r.id_reporte = h.id_reporte
  WHERE r.id_reporte = ANY(COALESCE(p_id_reportes, ARRAY[]::uuid[]))
    AND (r.id_usuario = v_actor OR public.es_administrador())
  ORDER BY h.id_reporte, h.fecha_cambio ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.consultar_historial_reportes(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consultar_historial_reportes(uuid[])
  TO authenticated;

COMMIT;
