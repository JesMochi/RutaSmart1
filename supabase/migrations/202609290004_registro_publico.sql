-- Registro público: rol vecino, aprobación de recolectores y solicitudes ligadas a una cuenta.
-- Es idempotente: puede ejecutarse otra vez si una corrida anterior quedó a medias.

ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('administrador', 'recolector', 'vecino'));

-- Los recolectores que se registran solos esperan aprobación; las cuentas existentes quedan aprobadas.
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS aprobado boolean NOT NULL DEFAULT true;

ALTER TABLE public.solicitudes
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS solicitudes_usuario_idx ON public.solicitudes (usuario_id);

-- Cada cuenta ve solo las solicitudes que envió.
DROP POLICY IF EXISTS solicitudes_propias_select ON public.solicitudes;
CREATE POLICY solicitudes_propias_select ON public.solicitudes
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

-- Una cuenta puede crear solicitudes a su nombre con las mismas reglas que el público.
DROP POLICY IF EXISTS solicitudes_propias_insert ON public.solicitudes;
CREATE POLICY solicitudes_propias_insert ON public.solicitudes
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = (SELECT auth.uid())
    AND estado = 'pendiente'
    AND NOT es_demo
    AND campo_trampa = ''
    AND kg_reales_pet = 0
    AND kg_reales_carton = 0
    AND kg_reales_aluminio = 0
    AND kg_reales_vidrio = 0
    AND public.zona_acepta_solicitudes(zona_id)
  );
