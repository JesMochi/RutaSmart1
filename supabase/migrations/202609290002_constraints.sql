-- Aplica los límites del MVP de forma incremental a una base con la migración 001.

-- La zona se escoge desde la aplicación; solo una puede aceptar solicitudes a la vez.
CREATE UNIQUE INDEX zonas_una_activa_idx
  ON public.zonas ((acepta_solicitudes))
  WHERE acepta_solicitudes;

-- Si el honeypot se omite, NULL no satisface la policy de inserción pública.
ALTER TABLE public.solicitudes
  ALTER COLUMN campo_trampa DROP DEFAULT,
  ALTER COLUMN campo_trampa DROP NOT NULL;

CREATE FUNCTION public.validar_maximo_vehiculos_por_zona()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.zona_id::text, 0));

  IF (
    SELECT count(*)
    FROM public.vehiculos AS vehiculo
    WHERE vehiculo.zona_id = NEW.zona_id
      AND vehiculo.id <> NEW.id
  ) >= 2 THEN
    RAISE EXCEPTION 'Cada zona puede tener como máximo dos vehículos.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER vehiculos_validar_maximo_por_zona
  BEFORE INSERT OR UPDATE OF zona_id ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION public.validar_maximo_vehiculos_por_zona();