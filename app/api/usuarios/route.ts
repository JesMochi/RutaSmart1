import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAdministrator } from "@/lib/supabase/authorize-admin";
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
      supabase.from("perfiles").select("user_id, nombre, rol, created_at").order("nombre"),
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

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nombre: input.nombre },
  });

  if (error || !data.user) {
    const exists = error?.code === "email_exists" || error?.status === 422;
    return Response.json(
      {
        error: exists
          ? "Ya existe una cuenta con ese correo."
          : "No se pudo crear la cuenta. Revisa la contraseña o intenta más tarde.",
        fields: exists ? { email: "Ya existe una cuenta con ese correo." } : undefined,
      },
      { status: exists ? 409 : 502 },
    );
  }

  const { error: profileError } = await supabase.from("perfiles").insert({
    user_id: data.user.id,
    nombre: input.nombre,
    rol: input.rol,
  });
  if (profileError) {
    // Sin perfil la cuenta no tendría rol; se revierte para no dejarla huérfana.
    await supabase.auth.admin.deleteUser(data.user.id);
    return Response.json({ error: "No se pudo registrar el rol del usuario." }, { status: 502 });
  }

  return Response.json(
    { usuario: { user_id: data.user.id, nombre: input.nombre, rol: input.rol, email: input.email } },
    { status: 201 },
  );
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
