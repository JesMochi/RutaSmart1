import { checkPublicRequestRateLimit, getClientAddress } from "@/lib/requests/rate-limit";
import { parsePublicRequestInput } from "@/lib/requests/validation";
import { getSupabaseClient, getSupabaseClientForToken } from "@/lib/supabase/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rateLimit = checkPublicRequestRateLimit(getClientAddress(request));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Alcanzaste el límite de envíos. Intenta más tarde." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json(
      { error: "El formato de la solicitud no es válido." },
      { status: 415 },
    );
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 10_000) {
      return Response.json(
        { error: "La solicitud es demasiado grande." },
        { status: 413 },
      );
    }
    payload = JSON.parse(body);
  } catch {
    return Response.json(
      { error: "El formato de la solicitud no es válido." },
      { status: 400 },
    );
  }

  const { input, errors } = parsePublicRequestInput(payload);
  if (!input) {
    return Response.json(
      { error: "Revisa los datos del formulario.", fields: errors },
      { status: 400 },
    );
  }

  if (input.honeypot) {
    return Response.json({ ok: true }, { status: 202 });
  }

  try {
    const row = {
      zona_id: input.zonaId,
      colonia: input.colonia,
      direccion: input.direccion,
      latitud: input.latitud,
      longitud: input.longitud,
      material: input.material,
      kg_estimados: input.kgEstimados,
      telefono: input.telefono,
      campo_trampa: "",
    };

    // Con sesión, la solicitud se guarda como el usuario para que pueda consultarla después.
    const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    let error: unknown;
    if (accessToken) {
      const supabase = getSupabaseClientForToken(accessToken);
      const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
      if (userError || !userData.user) {
        return Response.json(
          { error: "Tu sesión expiró. Vuelve a iniciar sesión o envía sin cuenta." },
          { status: 401 },
        );
      }
      ({ error } = await supabase
        .from("solicitudes")
        .insert({ ...row, usuario_id: userData.user.id }));
    } else {
      ({ error } = await getSupabaseClient().from("solicitudes").insert(row));
    }

    if (error) {
      return Response.json(
        { error: "No se pudo registrar la solicitud. Intenta más tarde." },
        { status: 503 },
      );
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json(
      { error: "El servicio no está disponible. Intenta más tarde." },
      { status: 503 },
    );
  }
}