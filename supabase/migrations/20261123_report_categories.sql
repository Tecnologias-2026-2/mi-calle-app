BEGIN;

ALTER TABLE public.reportes
  DROP CONSTRAINT IF EXISTS reportes_tipo_problema_check,
  ADD CONSTRAINT reportes_tipo_problema_check
    CHECK (tipo_problema = ANY (ARRAY[
      'bache'::text,
      'grieta'::text,
      'hundimiento'::text,
      'alcantarilla_sin_tapa'::text,
      'otro'::text,
      'Bache'::text,
      'Grieta / Fisura'::text,
      'Hundimiento'::text,
      'Alcantarilla sin tapa'::text,
      'Semáforo en mal estado'::text,
      'Señalización dañada o inexistente'::text,
      'Alumbrado público dañado'::text,
      'Acumulación de basura'::text,
      'Otro'::text
    ]));

CREATE OR REPLACE FUNCTION public.crear_reporte_completo(
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
     OR p_tipo_problema NOT IN (
       'Bache',
       'Grieta / Fisura',
       'Hundimiento',
       'Alcantarilla sin tapa',
       'Semáforo en mal estado',
       'Señalización dañada o inexistente',
       'Alumbrado público dañado',
       'Acumulación de basura',
       'Otro'
     )
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

COMMIT;
