-- Seguimiento en vivo: ubicación del recolector, tiempo estimado de llegada, carga del
-- vehículo y kilos reales por material. Es idempotente: puede ejecutarse otra vez.

ALTER TABLE public.rutas
  ADD COLUMN IF NOT EXISTS recolector_latitud double precision
    CHECK (recolector_latitud BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS recolector_longitud double precision
    CHECK (recolector_longitud BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS ubicacion_actualizada_at timestamptz,
  ADD COLUMN IF NOT EXISTS porcentaje_carga numeric(5, 2)
    CHECK (porcentaje_carga BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS carga_actualizada_at timestamptz;

CREATE OR REPLACE FUNCTION public.distancia_haversine_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  )));
$$;

-- Minutos estimados hasta cada parada pendiente. Parte de la ubicación reciente del
-- recolector; si no la hay, de la última parada cerrada o del depósito. Usa la matriz
-- guardada cuando existe el tramo y, si no, Haversine × factor a la velocidad de respaldo.
-- Suma los minutos fijos de cada parada anterior. Solo para uso interno.
CREATE OR REPLACE FUNCTION public.calcular_tiempos_ruta(p_ruta_id uuid)
RETURNS TABLE (
  parada_id uuid,
  solicitud_id uuid,
  secuencia integer,
  minutos_llegada numeric,
  metros_desde_recolector numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_ruta public.rutas%ROWTYPE;
  v_param public.parametros%ROWTYPE;
  v_gps_vigente boolean;
  v_origen_id uuid;
  v_origen_tipo text;
  v_lat double precision;
  v_lon double precision;
  v_metros double precision;
  v_segundos_tramo double precision;
  v_segundos double precision := 0;
  v_primera boolean := true;
  v_ultima record;
  r record;
BEGIN
  SELECT * INTO v_ruta FROM public.rutas AS ru WHERE ru.id = p_ruta_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_param FROM public.parametros AS pa WHERE pa.zona_id = v_ruta.zona_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_gps_vigente := v_ruta.recolector_latitud IS NOT NULL
    AND v_ruta.ubicacion_actualizada_at > now() - interval '10 minutes';

  IF v_gps_vigente THEN
    v_lat := v_ruta.recolector_latitud;
    v_lon := v_ruta.recolector_longitud;
  ELSE
    SELECT s.id, s.latitud, s.longitud INTO v_ultima
    FROM public.paradas AS p
    JOIN public.solicitudes AS s ON s.id = p.solicitud_id
    WHERE p.ruta_id = p_ruta_id AND p.estado <> 'pendiente'
    ORDER BY p.secuencia DESC
    LIMIT 1;

    IF FOUND THEN
      v_origen_id := v_ultima.id;
      v_origen_tipo := 'solicitud';
      v_lat := v_ultima.latitud;
      v_lon := v_ultima.longitud;
    ELSE
      v_origen_id := v_param.deposito_id;
      v_origen_tipo := 'deposito';
      v_lat := v_param.deposito_latitud;
      v_lon := v_param.deposito_longitud;
    END IF;
  END IF;

  FOR r IN
    SELECT p.id AS pid, p.solicitud_id AS sid, p.secuencia AS seq, s.latitud AS lat, s.longitud AS lon
    FROM public.paradas AS p
    JOIN public.solicitudes AS s ON s.id = p.solicitud_id
    WHERE p.ruta_id = p_ruta_id AND p.estado = 'pendiente'
    ORDER BY p.secuencia
  LOOP
    v_metros := NULL;
    IF v_origen_id IS NOT NULL THEN
      SELECT md.metros, md.segundos INTO v_metros, v_segundos_tramo
      FROM public.matriz_distancias AS md
      WHERE md.zona_id = v_ruta.zona_id
        AND md.origen_tipo = v_origen_tipo AND md.origen_id = v_origen_id
        AND md.destino_tipo = 'solicitud' AND md.destino_id = r.sid;
    END IF;

    IF v_metros IS NULL THEN
      v_metros := public.distancia_haversine_m(v_lat, v_lon, r.lat, r.lon)
        * v_param.factor_ajuste_linea_recta;
      v_segundos_tramo := v_metros / 1000 / v_param.velocidad_respaldo_km_h * 3600;
    END IF;

    IF NOT v_primera THEN
      v_segundos := v_segundos + v_param.minutos_fijos_por_parada * 60;
    END IF;
    v_segundos := v_segundos + v_segundos_tramo;

    parada_id := r.pid;
    solicitud_id := r.sid;
    secuencia := r.seq;
    minutos_llegada := round((v_segundos / 60)::numeric, 1);
    metros_desde_recolector := CASE
      WHEN v_gps_vigente THEN round(public.distancia_haversine_m(
        v_ruta.recolector_latitud, v_ruta.recolector_longitud, r.lat, r.lon
      )::numeric)
    END;
    RETURN NEXT;

    v_primera := false;
    v_origen_id := r.sid;
    v_origen_tipo := 'solicitud';
    v_lat := r.lat;
    v_lon := r.lon;
  END LOOP;
END;
$$;

-- Tiempos de una ruta para su recolector o un administrador.
CREATE OR REPLACE FUNCTION public.tiempos_ruta(p_ruta_id uuid)
RETURNS TABLE (
  parada_id uuid,
  solicitud_id uuid,
  secuencia integer,
  minutos_llegada numeric,
  metros_desde_recolector numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.es_administrador() AND NOT EXISTS (
    SELECT 1 FROM public.rutas AS ru
    WHERE ru.id = p_ruta_id AND ru.recolector_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'No tienes acceso a esta ruta.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public.calcular_tiempos_ruta(p_ruta_id);
END;
$$;

-- Seguimiento para el vecino: solo sus solicitudes asignadas. Expone la distancia al
-- recolector, nunca su ubicación exacta.
CREATE OR REPLACE FUNCTION public.seguimiento_mis_solicitudes()
RETURNS TABLE (
  solicitud_id uuid,
  ruta_estado text,
  fecha date,
  paradas_antes integer,
  minutos_llegada numeric,
  metros_recolector numeric,
  ubicacion_actualizada_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r record;
  t record;
BEGIN
  FOR r IN
    SELECT s.id AS sid, ru.id AS rid, ru.estado AS restado, ru.fecha AS rfecha,
           ru.ubicacion_actualizada_at AS rubicacion, p.secuencia AS seq
    FROM public.solicitudes AS s
    JOIN public.paradas AS p ON p.solicitud_id = s.id AND p.estado = 'pendiente'
    JOIN public.rutas AS ru ON ru.id = p.ruta_id AND ru.estado IN ('planeada', 'en_curso')
    WHERE s.usuario_id = (SELECT auth.uid()) AND s.estado = 'asignada'
  LOOP
    solicitud_id := r.sid;
    ruta_estado := r.restado;
    fecha := r.rfecha;
    ubicacion_actualizada_at := r.rubicacion;
    minutos_llegada := NULL;
    metros_recolector := NULL;

    SELECT count(*)::integer INTO paradas_antes
    FROM public.paradas AS p2
    WHERE p2.ruta_id = r.rid AND p2.estado = 'pendiente' AND p2.secuencia < r.seq;

    IF r.restado = 'en_curso' THEN
      SELECT ct.minutos_llegada AS minutos, ct.metros_desde_recolector AS metros INTO t
      FROM public.calcular_tiempos_ruta(r.rid) AS ct
      WHERE ct.solicitud_id = r.sid;
      IF FOUND THEN
        minutos_llegada := t.minutos;
        metros_recolector := t.metros;
      END IF;
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$;

-- El recolector comparte su ubicación; la primera vez la ruta pasa a en curso.
CREATE OR REPLACE FUNCTION public.registrar_ubicacion_recolector(
  p_ruta_id uuid,
  p_latitud double precision,
  p_longitud double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_latitud IS NULL OR p_longitud IS NULL
    OR p_latitud NOT BETWEEN -90 AND 90 OR p_longitud NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Ubicación inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.rutas
  SET recolector_latitud = p_latitud,
      recolector_longitud = p_longitud,
      ubicacion_actualizada_at = now(),
      estado = CASE WHEN estado = 'planeada' THEN 'en_curso' ELSE estado END
  WHERE id = p_ruta_id
    AND recolector_id = (SELECT auth.uid())
    AND estado IN ('planeada', 'en_curso');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No puedes actualizar esta ruta.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Qué tan lleno va el vehículo, según el recolector.
CREATE OR REPLACE FUNCTION public.registrar_carga_vehiculo(p_ruta_id uuid, p_porcentaje numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_porcentaje IS NULL OR p_porcentaje < 0 OR p_porcentaje > 100 THEN
    RAISE EXCEPTION 'Indica un porcentaje de 0 a 100.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.rutas
  SET porcentaje_carga = p_porcentaje, carga_actualizada_at = now()
  WHERE id = p_ruta_id
    AND (recolector_id = (SELECT auth.uid()) OR public.es_administrador())
    AND estado IN ('planeada', 'en_curso');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No puedes actualizar esta ruta.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Cierra una parada como recolectada con los kilos reales de cada material.
CREATE OR REPLACE FUNCTION public.registrar_recoleccion_materiales(
  p_parada_id uuid,
  p_kg_pet numeric,
  p_kg_carton numeric,
  p_kg_aluminio numeric,
  p_kg_vidrio numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parada public.paradas%ROWTYPE;
  v_ruta public.rutas%ROWTYPE;
  v_total numeric;
  v_pendientes integer;
BEGIN
  IF coalesce(p_kg_pet, 0) < 0 OR coalesce(p_kg_carton, 0) < 0
    OR coalesce(p_kg_aluminio, 0) < 0 OR coalesce(p_kg_vidrio, 0) < 0 THEN
    RAISE EXCEPTION 'Los kilos no pueden ser negativos.' USING ERRCODE = '22023';
  END IF;
  v_total := coalesce(p_kg_pet, 0) + coalesce(p_kg_carton, 0)
    + coalesce(p_kg_aluminio, 0) + coalesce(p_kg_vidrio, 0);
  IF v_total <= 0 OR v_total > 10000 THEN
    RAISE EXCEPTION 'Indica kilos reales mayores a 0 y hasta 10,000 en total.'
      USING ERRCODE = '22023';
  END IF;

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

  UPDATE public.paradas
  SET estado = 'recolectada', recolectada_at = now()
  WHERE id = p_parada_id;

  UPDATE public.solicitudes
  SET estado = 'recolectada',
      kg_reales_pet = coalesce(p_kg_pet, 0),
      kg_reales_carton = coalesce(p_kg_carton, 0),
      kg_reales_aluminio = coalesce(p_kg_aluminio, 0),
      kg_reales_vidrio = coalesce(p_kg_vidrio, 0)
  WHERE id = v_parada.solicitud_id;

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

REVOKE ALL ON FUNCTION public.calcular_tiempos_ruta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tiempos_ruta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiempos_ruta(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.seguimiento_mis_solicitudes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seguimiento_mis_solicitudes() TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_ubicacion_recolector(uuid, double precision, double precision)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_ubicacion_recolector(uuid, double precision, double precision)
  TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_carga_vehiculo(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_carga_vehiculo(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_recoleccion_materiales(uuid, numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recoleccion_materiales(uuid, numeric, numeric, numeric, numeric)
  TO authenticated;
