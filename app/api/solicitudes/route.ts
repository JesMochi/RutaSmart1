import { checkPublicRequestRateLimit } from "@/lib/requests/rate-limit";
import { parsePublicRequestInput } from "@/lib/requests/validation";
import { getSupabaseClient } from "@/lib/supabase/client";

export const runtime = "nodejs";

function getClientAddress(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

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
    const { error } = await getSupabaseClient().from("solicitudes").insert({
      zona_id: input.zonaId,
      colonia: input.colonia,
      direccion: input.direccion,
      latitud: input.latitud,
      longitud: input.longitud,
      material: input.material,
      kg_estimados: input.kgEstimados,
      telefono: input.telefono,
      campo_trampa: "",
    });

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