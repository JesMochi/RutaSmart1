-- El registro público usa supabase.auth.signUp; este trigger crea el perfil con el rol
-- elegido. Solo acepta vecino o recolector: administrador nunca se asigna desde el registro.
-- Es idempotente: puede ejecutarse otra vez.

CREATE OR REPLACE FUNCTION public.crear_perfil_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol text := NEW.raw_user_meta_data ->> 'rol';
  v_nombre text := trim(coalesce(NEW.raw_user_meta_data ->> 'nombre', ''));
BEGIN
  -- Las cuentas creadas por un administrador no traen rol en metadata; su perfil se inserta aparte.
  IF v_rol IS NULL OR v_rol NOT IN ('vecino', 'recolector') THEN
    RETURN NEW;
  END IF;

  IF char_length(v_nombre) < 2 THEN
    v_nombre := split_part(coalesce(NEW.email, 'Usuario'), '@', 1);
  END IF;

  INSERT INTO public.perfiles (user_id, nombre, rol, aprobado)
  VALUES (NEW.id, left(v_nombre, 80), v_rol, v_rol = 'vecino')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_perfil_registro() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS perfiles_crear_al_registrarse ON auth.users;
CREATE TRIGGER perfiles_crear_al_registrarse
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_registro();
