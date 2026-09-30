import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAdministrator } from "@/lib/supabase/authorize-admin";
import { createAccount } from "@/lib/users/create-account";
import { parseNewStaffUserInput } from "@/lib/users/validation";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "Cache-Control": "no-store" };

async function authorize(
  request: Request,
): Promise<{ userId: string } | { response: Response }> {
  try {
    const result = await resolveAdministrator(request.headers.get("authorization"));
    if (result.status === "authorized") return { userId: result.userId };
    return {
      response:
        result.status === "unauthenticated"
          ? Response.json({ error: "Autenticación requerida." }, { status: 401 })
          : Response.json({ error: "Se requiere rol administrador." }, { status: 403 }),
    };
  } catch {
    return {
      response: Response.json(
        { error: "La gestión de usuarios no está configurada en el servidor." },
        { status: 503 },
      ),
    };
  }
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  try {
    const supabase = getSupabaseAdminClient();
    const [profiles, users] = await Promise.all([
      supabase.from("perfiles").select("user_id, nombre, rol, aprobado, created_at").order("nombre"),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (profiles.error || users.error) throw new Error("Consulta fallida.");

    const emails = new Map(users.data.users.map((user) => [user.id, user.email ?? ""]));
    return Response.json(
      {
        currentUserId: auth.userId,
        usuarios: profiles.data.map((profile) => ({
          ...profile,
          email: emails.get(profile.user_id) ?? "",
        })),
      },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json({ error: "No se pudieron consultar los usuarios." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "El formato de la solicitud no es válido." }, { status: 400 });
  }

  const { input, errors } = parseNewStaffUserInput(payload);
  if (!input) {
    return Response.json({ error: "Revisa los datos del usuario.", fields: errors }, { status: 400 });
  }

  // Las cuentas creadas por un administrador quedan aprobadas.
  const result = await createAccount(input, true);
  if (!result.ok) {
    return Response.json({ error: result.error, fields: result.fields }, { status: result.status });
  }
  return Response.json({ usuario: result.usuario }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const userId = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_PATTERN.test(userId)) {
    return Response.json({ error: "Usuario inválido." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "El formato de la solicitud no es válido." }, { status: 400 });
  }
  const aprobado = (payload as { aprobado?: unknown } | null)?.aprobado;
  if (typeof aprobado !== "boolean") {
    return Response.json({ error: "Indica si la cuenta queda aprobada." }, { status: 400 });
  }
  if (userId === auth.userId) {
    return Response.json({ error: "No puedes cambiar la aprobación de tu propia cuenta." }, { status: 400 });
  }

  const { error } = await getSupabaseAdminClient()
    .from("perfiles")
    .update({ aprobado })
    .eq("user_id", userId);
  if (error) {
    return Response.json({ error: "No se pudo actualizar la cuenta." }, { status: 502 });
  }
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const userId = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_PATTERN.test(userId)) {
    return Response.json({ error: "Usuario inválido." }, { status: 400 });
  }
  if (userId === auth.userId) {
    return Response.json({ error: "No puedes eliminar tu propia cuenta." }, { status: 400 });
  }

  // El perfil se borra en cascada y las rutas del recolector quedan sin asignar.
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    return Response.json({ error: "No se pudo eliminar el usuario." }, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
