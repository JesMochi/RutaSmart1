CREATE TABLE public.zonas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  municipio text NOT NULL,
  estado text NOT NULL,
  acepta_solicitudes boolean NOT NULL DEFAULT true,
  es_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nombre, municipio, estado)
);

CREATE TABLE public.perfiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('administrador', 'recolector')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.depositos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id uuid NOT NULL UNIQUE REFERENCES public.zonas (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  direccion text NOT NULL,
  latitud double precision NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud double precision NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  es_ficticio boolean NOT NULL DEFAULT false,
  es_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, zona_id)
);

CREATE TABLE public.vehiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id uuid NOT NULL REFERENCES public.zonas (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  capacidad_kg numeric(10, 2) NOT NULL CHECK (capacidad_kg > 0),
  disponible boolean NOT NULL DEFAULT true,
  es_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, zona_id)
);

CREATE TABLE public.parametros (
  zona_id uuid PRIMARY KEY REFERENCES public.zonas (id) ON DELETE CASCADE,
  deposito_id uuid NOT NULL UNIQUE,
  rendimiento_vehiculo_km_l numeric(8, 3) NOT NULL CHECK (rendimiento_vehiculo_km_l > 0),
  precio_combustible_por_litro numeric(10, 2) NOT NULL CHECK (precio_combustible_por_litro >= 0),
  minutos_fijos_por_parada numeric(8, 2) NOT NULL CHECK (minutos_fijos_por_parada >= 0),
  velocidad_respaldo_km_h numeric(8, 2) NOT NULL CHECK (velocidad_respaldo_km_h > 0),
  factor_ajuste_linea_recta numeric(6, 3) NOT NULL CHECK (factor_ajuste_linea_recta >= 1),
  capacidad_por_vehiculo_kg numeric(10, 2) NOT NULL CHECK (capacidad_por_vehiculo_kg > 0),
  deposito_latitud double precision NOT NULL CHECK (deposito_latitud BETWEEN -90 AND 90),
  deposito_longitud double precision NOT NULL CHECK (deposito_longitud BETWEEN -180 AND 180),
  es_demo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (deposito_id, zona_id)
    REFERENCES public.depositos (id, zona_id) ON DELETE CASCADE
);

CREATE TABLE public.solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id uuid NOT NULL REFERENCES public.zonas (id),
  colonia text NOT NULL CHECK (char_length(trim(colonia)) BETWEEN 2 AND 120),
  direccion text NOT NULL CHECK (char_length(trim(direccion)) BETWEEN 5 AND 240),
  latitud double precision NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud double precision NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  material text NOT NULL CHECK (material IN ('PET', 'Cartón', 'Aluminio', 'Vidrio')),
  kg_estimados numeric(10, 2) NOT NULL CHECK (kg_estimados > 0 AND kg_estimados <= 10000),
  telefono text NOT NULL CHECK (telefono ~ '^[0-9+() -]{10,20}$'),
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'asignada', 'recolectada', 'sin_asignar')),
  kg_reales_pet numeric(10, 2) NOT NULL DEFAULT 0 CHECK (kg_reales_pet >= 0),
  kg_reales_carton numeric(10, 2) NOT NULL DEFAULT 0 CHECK (kg_reales_carton >= 0),
  kg_reales_aluminio numeric(10, 2) NOT NULL DEFAULT 0 CHECK (kg_reales_aluminio >= 0),
  kg_reales_vidrio numeric(10, 2) NOT NULL DEFAULT 0 CHECK (kg_reales_vidrio >= 0),
  campo_trampa text NOT NULL DEFAULT '' CHECK (char_length(campo_trampa) <= 200),
  es_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, zona_id)
);

CREATE TABLE public.rutas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id uuid NOT NULL REFERENCES public.zonas (id),
  vehiculo_id uuid NOT NULL,
  recolector_id uuid REFERENCES public.perfiles (user_id) ON DELETE SET NULL,
  fecha date NOT NULL,
  estado text NOT NULL DEFAULT 'planeada'
    CHECK (estado IN ('planeada', 'en_curso', 'completada', 'cancelada')),
  capacidad_kg numeric(10, 2) NOT NULL CHECK (capacidad_kg > 0),
  kg_estimados numeric(10, 2) NOT NULL DEFAULT 0 CHECK (kg_estimados >= 0),
  kilometros_totales numeric(10, 3) NOT NULL DEFAULT 0 CHECK (kilometros_totales >= 0),
  minutos_estimados numeric(10, 2) NOT NULL DEFAULT 0 CHECK (minutos_estimados >= 0),
  litros_estimados numeric(10, 3) NOT NULL DEFAULT 0 CHECK (litros_estimados >= 0),
  costo_combustible numeric(10, 2) NOT NULL DEFAULT 0 CHECK (costo_combustible >= 0),
  costo_por_kg numeric(10, 4) NOT NULL DEFAULT 0 CHECK (costo_por_kg >= 0),
  kg_por_km numeric(10, 4) NOT NULL DEFAULT 0 CHECK (kg_por_km >= 0),
  kg_por_hora numeric(10, 4) NOT NULL DEFAULT 0 CHECK (kg_por_hora >= 0),
  km_base_registro numeric(10, 3) NOT NULL DEFAULT 0 CHECK (km_base_registro >= 0),
  km_base_colonia numeric(10, 3) NOT NULL DEFAULT 0 CHECK (km_base_colonia >= 0),
  es_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vehiculo_id, zona_id)
    REFERENCES public.vehiculos (id, zona_id),
  UNIQUE (id, zona_id)
);

CREATE TABLE public.paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona_id uuid NOT NULL,
  ruta_id uuid NOT NULL,
  solicitud_id uuid NOT NULL,
  secuencia integer NOT NULL CHECK (secuencia > 0),
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'recolectada', 'sin_recolectar')),
  recolectada_at timestamptz,
  es_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (ruta_id, zona_id)
    REFERENCES public.rutas (id, zona_id) ON DELETE CASCADE,
  FOREIGN KEY (solicitud_id, zona_id)
    REFERENCES public.solicitudes (id, zona_id),
  UNIQUE (ruta_id, secuencia),
  UNIQUE (ruta_id, solicitud_id)
);

CREATE TABLE public.matriz_distancias (
  zona_id uuid NOT NULL REFERENCES public.zonas (id) ON DELETE CASCADE,
  origen_tipo text NOT NULL CHECK (origen_tipo IN ('deposito', 'solicitud')),
  origen_id uuid NOT NULL,
  destino_tipo text NOT NULL CHECK (destino_tipo IN ('deposito', 'solicitud')),
  destino_id uuid NOT NULL,
  metros integer NOT NULL CHECK (metros >= 0),
  segundos integer NOT NULL CHECK (segundos >= 0),
  fuente text NOT NULL CHECK (fuente IN ('osrm', 'haversine')),
  es_demo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zona_id, origen_tipo, origen_id, destino_tipo, destino_id),
  CHECK (origen_tipo <> destino_tipo OR origen_id <> destino_id)
);

CREATE INDEX solicitudes_zona_estado_idx ON public.solicitudes (zona_id, estado);
CREATE INDEX solicitudes_zona_fecha_idx ON public.solicitudes (zona_id, created_at);
CREATE INDEX rutas_recolector_fecha_idx ON public.rutas (recolector_id, fecha);
CREATE INDEX paradas_solicitud_idx ON public.paradas (solicitud_id);
CREATE INDEX matriz_zona_fuente_idx ON public.matriz_distancias (zona_id, fuente);

CREATE FUNCTION public.actualizar_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER zonas_actualizar_updated_at
  BEFORE UPDATE ON public.zonas
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
CREATE TRIGGER perfiles_actualizar_updated_at
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
CREATE TRIGGER depositos_actualizar_updated_at
  BEFORE UPDATE ON public.depositos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
CREATE TRIGGER vehiculos_actualizar_updated_at
  BEFORE UPDATE ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
CREATE TRIGGER parametros_actualizar_updated_at
  BEFORE UPDATE ON public.parametros
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
CREATE TRIGGER solicitudes_actualizar_updated_at
  BEFORE UPDATE ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
CREATE TRIGGER rutas_actualizar_updated_at
  BEFORE UPDATE ON public.rutas
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();
CREATE TRIGGER paradas_actualizar_updated_at
  BEFORE UPDATE ON public.paradas
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_updated_at();

CREATE FUNCTION public.sincronizar_coordenadas_deposito()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.depositos
  SET latitud = NEW.deposito_latitud,
      longitud = NEW.deposito_longitud
  WHERE id = NEW.deposito_id AND zona_id = NEW.zona_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER parametros_sincronizar_deposito
  AFTER INSERT OR UPDATE ON public.parametros
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_coordenadas_deposito();

CREATE FUNCTION public.es_administrador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles AS perfil
    WHERE perfil.user_id = (SELECT auth.uid())
      AND perfil.rol = 'administrador'
  );
$$;

CREATE FUNCTION public.zona_acepta_solicitudes(p_zona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.zonas AS zona
    WHERE zona.id = p_zona_id AND zona.acepta_solicitudes
  );
$$;

ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depositos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriz_distancias ENABLE ROW LEVEL SECURITY;

CREATE POLICY zonas_admin_all ON public.zonas
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());

CREATE POLICY perfiles_select_self ON public.perfiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.es_administrador());
CREATE POLICY perfiles_admin_all ON public.perfiles
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());

CREATE POLICY depositos_admin_all ON public.depositos
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());
CREATE POLICY vehiculos_admin_all ON public.vehiculos
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());
CREATE POLICY parametros_admin_all ON public.parametros
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());

CREATE POLICY solicitudes_public_insert ON public.solicitudes
  FOR INSERT TO anon
  WITH CHECK (
    estado = 'pendiente'
    AND NOT es_demo
    AND campo_trampa = ''
    AND public.zona_acepta_solicitudes(zona_id)
  );
CREATE POLICY solicitudes_admin_all ON public.solicitudes
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());
CREATE POLICY solicitudes_recolector_select ON public.solicitudes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.paradas AS parada
      JOIN public.rutas AS ruta ON ruta.id = parada.ruta_id
      WHERE parada.solicitud_id = solicitudes.id
        AND ruta.recolector_id = (SELECT auth.uid())
    )
  );

CREATE POLICY rutas_admin_all ON public.rutas
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());
CREATE POLICY rutas_recolector_select ON public.rutas
  FOR SELECT TO authenticated
  USING (recolector_id = (SELECT auth.uid()));

CREATE POLICY paradas_admin_all ON public.paradas
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());
CREATE POLICY paradas_recolector_select ON public.paradas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rutas AS ruta
      WHERE ruta.id = paradas.ruta_id
        AND ruta.recolector_id = (SELECT auth.uid())
    )
  );

CREATE POLICY matriz_distancias_admin_all ON public.matriz_distancias
  FOR ALL TO authenticated
  USING (public.es_administrador())
  WITH CHECK (public.es_administrador());

CREATE VIEW public.impacto_publico
WITH (security_barrier = true)
AS
SELECT
  COALESCE((
    SELECT SUM(
      solicitud.kg_reales_pet
      + solicitud.kg_reales_carton
      + solicitud.kg_reales_aluminio
      + solicitud.kg_reales_vidrio
    )
    FROM public.solicitudes AS solicitud
    WHERE solicitud.estado = 'recolectada'
  ), 0)::numeric(14, 2) AS kg_recolectados,
  COALESCE((
    SELECT SUM(
      GREATEST(ruta.km_base_registro - ruta.kilometros_totales, 0)
      / NULLIF(parametro.rendimiento_vehiculo_km_l, 0)
    )
    FROM public.rutas AS ruta
    JOIN public.parametros AS parametro ON parametro.zona_id = ruta.zona_id
    WHERE ruta.estado = 'completada'
  ), 0)::numeric(14, 2) AS combustible_ahorrado_litros;

CREATE FUNCTION public.cargar_datos_demo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.matriz_distancias WHERE es_demo;
  DELETE FROM public.paradas WHERE es_demo;
  DELETE FROM public.rutas WHERE es_demo;
  DELETE FROM public.solicitudes WHERE es_demo;
  DELETE FROM public.parametros WHERE es_demo;

  INSERT INTO public.zonas (id, nombre, municipio, estado, es_demo)
  VALUES (
    '00000000-0000-4000-8000-000000000001',
    'Jardines de Morelos',
    'Ecatepec de Morelos',
    'Estado de México',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    municipio = EXCLUDED.municipio,
    estado = EXCLUDED.estado,
    acepta_solicitudes = true,
    es_demo = true;

  INSERT INTO public.depositos (
    id, zona_id, nombre, direccion, latitud, longitud, es_ficticio, es_demo
  ) VALUES (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'Centro de acopio demostrativo',
    'Ubicación ficticia para demostración',
    19.601000,
    -99.032000,
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    zona_id = EXCLUDED.zona_id,
    nombre = EXCLUDED.nombre,
    direccion = EXCLUDED.direccion,
    latitud = EXCLUDED.latitud,
    longitud = EXCLUDED.longitud,
    es_ficticio = true,
    es_demo = true;

  INSERT INTO public.vehiculos (id, zona_id, nombre, capacidad_kg, disponible, es_demo)
  VALUES
    ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Vehículo 1', 350, true, true),
    ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Vehículo 2', 350, true, true)
  ON CONFLICT (id) DO UPDATE SET
    zona_id = EXCLUDED.zona_id,
    nombre = EXCLUDED.nombre,
    capacidad_kg = EXCLUDED.capacidad_kg,
    disponible = EXCLUDED.disponible,
    es_demo = true;

  INSERT INTO public.parametros (
    zona_id, deposito_id, rendimiento_vehiculo_km_l,
    precio_combustible_por_litro, minutos_fijos_por_parada,
    velocidad_respaldo_km_h, factor_ajuste_linea_recta,
    capacidad_por_vehiculo_kg, deposito_latitud, deposito_longitud, es_demo
  ) VALUES (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    8.000, 24.50, 8.00, 25.00, 1.300, 350.00,
    19.601000, -99.032000, true
  )
  ON CONFLICT (zona_id) DO UPDATE SET
    deposito_id = EXCLUDED.deposito_id,
    rendimiento_vehiculo_km_l = EXCLUDED.rendimiento_vehiculo_km_l,
    precio_combustible_por_litro = EXCLUDED.precio_combustible_por_litro,
    minutos_fijos_por_parada = EXCLUDED.minutos_fijos_por_parada,
    velocidad_respaldo_km_h = EXCLUDED.velocidad_respaldo_km_h,
    factor_ajuste_linea_recta = EXCLUDED.factor_ajuste_linea_recta,
    capacidad_por_vehiculo_kg = EXCLUDED.capacidad_por_vehiculo_kg,
    deposito_latitud = EXCLUDED.deposito_latitud,
    deposito_longitud = EXCLUDED.deposito_longitud,
    es_demo = true;

  INSERT INTO public.solicitudes (
    id, zona_id, colonia, direccion, latitud, longitud,
    material, kg_estimados, telefono, es_demo
  ) VALUES
    ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Robles 14 (domicilio simulado)', 19.602100, -99.031200, 'PET', 18, '0000000001', true),
    ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Fresno 28 (domicilio simulado)', 19.603000, -99.030100, 'Cartón', 22, '0000000002', true),
    ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Cedros 7 (domicilio simulado)', 19.604200, -99.032500, 'Aluminio', 7, '0000000003', true),
    ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Avenida Central 35 (domicilio simulado)', 19.599800, -99.029800, 'Vidrio', 16, '0000000004', true),
    ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Pinos 19 (domicilio simulado)', 19.600400, -99.035000, 'PET', 31, '0000000005', true),
    ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Olivos 42 (domicilio simulado)', 19.605100, -99.034100, 'Cartón', 14, '0000000006', true),
    ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Naranjos 11 (domicilio simulado)', 19.597900, -99.033300, 'Vidrio', 12, '0000000007', true),
    ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Laureles 53 (domicilio simulado)', 19.601600, -99.027900, 'PET', 25, '0000000008', true),
    ('00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Cipreses 6 (domicilio simulado)', 19.606000, -99.031700, 'Aluminio', 5, '0000000009', true),
    ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Avenida Jardines 80 (domicilio simulado)', 19.598800, -99.028100, 'Cartón', 38, '0000000010', true),
    ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Jacarandas 17 (domicilio simulado)', 19.603700, -99.036000, 'PET', 11, '0000000011', true),
    ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Magnolias 23 (domicilio simulado)', 19.596700, -99.030600, 'Vidrio', 21, '0000000012', true),
    ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Bugambilias 31 (domicilio simulado)', 19.605500, -99.028900, 'Cartón', 27, '0000000013', true),
    ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Girasoles 9 (domicilio simulado)', 19.599200, -99.036500, 'Aluminio', 9, '0000000014', true),
    ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Azucenas 46 (domicilio simulado)', 19.602900, -99.026900, 'PET', 34, '0000000015', true),
    ('00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Gardenias 12 (domicilio simulado)', 19.597200, -99.035100, 'Vidrio', 18, '0000000016', true),
    ('00000000-0000-4000-8000-000000000117', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Alcatraces 38 (domicilio simulado)', 19.604800, -99.027300, 'Cartón', 16, '0000000017', true),
    ('00000000-0000-4000-8000-000000000118', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Violetas 5 (domicilio simulado)', 19.595900, -99.032000, 'PET', 22, '0000000018', true),
    ('00000000-0000-4000-8000-000000000119', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Tulipanes 21 (domicilio simulado)', 19.606400, -99.034800, 'Aluminio', 12, '0000000019', true),
    ('00000000-0000-4000-8000-000000000120', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Orquídeas 16 (domicilio simulado)', 19.600100, -99.026500, 'Cartón', 30, '0000000020', true),
    ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Lirios 44 (domicilio simulado)', 19.598100, -99.027200, 'Vidrio', 14, '0000000021', true),
    ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Dalias 27 (domicilio simulado)', 19.605900, -99.029700, 'PET', 28, '0000000022', true),
    ('00000000-0000-4000-8000-000000000123', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Camelias 3 (domicilio simulado)', 19.596300, -99.028600, 'Cartón', 24, '0000000023', true),
    ('00000000-0000-4000-8000-000000000124', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Lotos 58 (domicilio simulado)', 19.603400, -99.034700, 'Vidrio', 11, '0000000024', true),
    ('00000000-0000-4000-8000-000000000125', '00000000-0000-4000-8000-000000000001', 'Jardines de Morelos', 'Calle Acacias 33 (domicilio simulado)', 19.599500, -99.033800, 'Aluminio', 8, '0000000025', true);
END;
$$;

CREATE FUNCTION public.restablecer_demostracion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede restablecer la demostración.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.cargar_datos_demo();
  RETURN jsonb_build_object(
    'ok', true,
    'zona', 'Jardines de Morelos',
    'solicitudes_cargadas', 25
  );
END;
$$;

REVOKE ALL ON FUNCTION public.es_administrador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_administrador() TO authenticated;
REVOKE ALL ON FUNCTION public.zona_acepta_solicitudes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zona_acepta_solicitudes(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.cargar_datos_demo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restablecer_demostracion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restablecer_demostracion() TO authenticated;

REVOKE ALL ON TABLE
  public.zonas,
  public.perfiles,
  public.depositos,
  public.vehiculos,
  public.parametros,
  public.solicitudes,
  public.rutas,
  public.paradas,
  public.matriz_distancias
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.zonas,
  public.perfiles,
  public.depositos,
  public.vehiculos,
  public.parametros,
  public.solicitudes,
  public.rutas,
  public.paradas,
  public.matriz_distancias
TO authenticated;

GRANT INSERT (
  zona_id, colonia, direccion, latitud, longitud, material,
  kg_estimados, telefono, campo_trampa
) ON TABLE public.solicitudes TO anon;

REVOKE ALL ON public.impacto_publico FROM PUBLIC;
GRANT SELECT ON public.impacto_publico TO anon, authenticated;

COMMENT ON VIEW public.impacto_publico IS
  'Agregados sin datos personales para el contador público de impacto.';
COMMENT ON COLUMN public.solicitudes.telefono IS
  'Dato privado; no incluir en vistas ni consultas públicas.';
COMMENT ON COLUMN public.solicitudes.campo_trampa IS
  'Honeypot: las solicitudes públicas solo se aceptan si este campo está vacío.';