import { checkPublicRequestRateLimit, getClientAddress } from "@/lib/requests/rate-limit";
import { createAccount } from "@/lib/users/create-account";
import { parseNewStaffUserInput, PUBLIC_SIGNUP_ROLES } from "@/lib/users/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rateLimit = checkPublicRequestRateLimit(`registro:${getClientAddress(request)}`);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Demasiados registros desde esta conexión. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "El formato de la solicitud no es válido." }, { status: 400 });
  }

  // Mismo honeypot que el formulario de solicitudes: los bots lo llenan.
  const honeypot = (payload as { honeypot?: unknown } | null)?.honeypot;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return Response.json({ ok: true }, { status: 202 });
  }

  const { input, errors } = parseNewStaffUserInput(payload, PUBLIC_SIGNUP_ROLES);
  if (!input) {
    return Response.json({ error: "Revisa los datos del registro.", fields: errors }, { status: 400 });
  }

  try {
    // Los vecinos quedan activos; los recolectores esperan aprobación del administrador.
    const result = await createAccount(input, input.rol === "vecino");
    if (!result.ok) {
      return Response.json({ error: result.error, fields: result.fields }, { status: result.status });
    }
    return Response.json(
      { ok: true, rol: result.usuario.rol, aprobado: result.usuario.aprobado },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "El registro no está disponible por ahora. Intenta más tarde." },
      { status: 503 },
    );
  }
}
