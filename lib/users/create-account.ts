import "server-only";

import { getSupabaseAdminClient } from "../supabase/admin";
import type { NewStaffUserErrors, NewStaffUserInput, StaffRole } from "./validation";

export type CreateAccountResult =
  | {
      ok: true;
      usuario: { user_id: string; nombre: string; rol: StaffRole; email: string; aprobado: boolean };
    }
  | { ok: false; status: number; error: string; fields?: NewStaffUserErrors };

/** Crea la cuenta de Auth ya confirmada y su perfil; si el perfil falla, borra la cuenta. */
export async function createAccount(
  input: NewStaffUserInput,
  aprobado: boolean,
): Promise<CreateAccountResult> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nombre: input.nombre },
  });

  if (error || !data.user) {
    const exists = error?.code === "email_exists" || error?.status === 422;
    return exists
      ? {
          ok: false,
          status: 409,
          error: "Ya existe una cuenta con ese correo.",
          fields: { email: "Ya existe una cuenta con ese correo." },
        }
      : {
          ok: false,
          status: 502,
          error: "No se pudo crear la cuenta. Revisa la contraseña o intenta más tarde.",
        };
  }

  const { error: profileError } = await supabase.from("perfiles").insert({
    user_id: data.user.id,
    nombre: input.nombre,
    rol: input.rol,
    aprobado,
  });
  if (profileError) {
    // Sin perfil la cuenta no tendría rol; se revierte para no dejarla huérfana.
    await supabase.auth.admin.deleteUser(data.user.id);
    return { ok: false, status: 502, error: "No se pudo registrar el rol de la cuenta." };
  }

  return {
    ok: true,
    usuario: {
      user_id: data.user.id,
      nombre: input.nombre,
      rol: input.rol,
      email: input.email,
      aprobado,
    },
  };
}
