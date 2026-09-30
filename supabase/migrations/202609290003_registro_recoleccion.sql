-- Permite al recolector asignado (o a un administrador) cerrar una parada sin
-- concederle UPDATE directo sobre paradas, solicitudes ni rutas.

CREATE FUNCTION public.registrar_recoleccion(
  p_parada_id uuid,
  p_recolectada boolean,
  p_kg_reales numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parada public.paradas%ROWTYPE;
  v_ruta public.rutas%ROWTYPE;
  v_material text;
  v_pendientes integer;
BEGIN
  SELECT * INTO v_parada FROM public.paradas WHERE id = p_parada_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La parada no existe.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_ruta FROM public.rutas WHERE id = v_parada.ruta_id FOR UPDATE;

  IF (SELECT auth.uid()) IS NULL
    OR (v_ruta.recolector_id IS DISTINCT FROM (SELECT auth.uid())
        AND NOT public.es_administrador()) THEN
    RAISE EXCEPTION 'Solo el recolector asignado puede registrar esta parada.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ruta.estado NOT IN ('planeada', 'en_curso') THEN
    RAISE EXCEPTION 'La ruta ya no está activa.' USING ERRCODE = '22023';
  END IF;

  IF p_recolectada THEN
    IF p_kg_reales IS NULL OR p_kg_reales <= 0 OR p_kg_reales > 10000 THEN
      RAISE EXCEPTION 'Indica kilos reales mayores a 0 y hasta 10,000.'
        USING ERRCODE = '22023';
    END IF;

    SELECT material INTO v_material
    FROM public.solicitudes WHERE id = v_parada.solicitud_id;

    UPDATE public.paradas
    SET estado = 'recolectada', recolectada_at = now()
    WHERE id = p_parada_id;

    UPDATE public.solicitudes
    SET estado = 'recolectada',
        kg_reales_pet = CASE WHEN v_material = 'PET' THEN p_kg_reales ELSE 0 END,
        kg_reales_carton = CASE WHEN v_material = 'Cartón' THEN p_kg_reales ELSE 0 END,
        kg_reales_aluminio = CASE WHEN v_material = 'Aluminio' THEN p_kg_reales ELSE 0 END,
        kg_reales_vidrio = CASE WHEN v_material = 'Vidrio' THEN p_kg_reales ELSE 0 END
    WHERE id = v_parada.solicitud_id;
  ELSE
    UPDATE public.paradas
    SET estado = 'sin_recolectar', recolectada_at = NULL
    WHERE id = p_parada_id;

    -- Vuelve a la bandeja del administrador para reprogramarla.
    UPDATE public.solicitudes
    SET estado = 'sin_asignar',
        kg_reales_pet = 0, kg_reales_carton = 0,
        kg_reales_aluminio = 0, kg_reales_vidrio = 0
    WHERE id = v_parada.solicitud_id;
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.paradas
  WHERE ruta_id = v_ruta.id AND estado = 'pendiente';

  UPDATE public.rutas
  SET estado = CASE WHEN v_pendientes = 0 THEN 'completada' ELSE 'en_curso' END
  WHERE id = v_ruta.id;

  RETURN jsonb_build_object(
    'ruta_id', v_ruta.id,
    'paradas_pendientes', v_pendientes,
    'ruta_completada', v_pendientes = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_recoleccion(uuid, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recoleccion(uuid, boolean, numeric) TO authenticated;
