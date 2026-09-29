import {
  ensureDistanceMatrix,
  getDistanceMatrixCoverage,
} from "@/lib/distances/matrix";
import { authorizeAdministrator } from "@/lib/supabase/authorize-admin";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function zoneIdFromRequest(request: Request): string | null {
  const zoneId =
    new URL(request.url).searchParams.get("zonaId") ??
    process.env.NEXT_PUBLIC_RUTA_ZONA_ID;

  return zoneId && UUID_PATTERN.test(zoneId) ? zoneId : null;
}

async function authorize(request: Request): Promise<Response | null> {
  try {
    const authorization = await authorizeAdministrator(
      request.headers.get("authorization"),
    );

    if (authorization === "unauthenticated") {
      return Response.json({ error: "Autenticación requerida." }, { status: 401 });
    }
    if (authorization === "forbidden") {
      return Response.json({ error: "Se requiere rol administrador." }, { status: 403 });
    }
    return null;
  } catch {
    return Response.json(
      { error: "No se pudo validar la sesión de administrador." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;

  const zoneId = zoneIdFromRequest(request);
  if (!zoneId) {
    return Response.json({ error: "Configura un ID de zona válido." }, { status: 400 });
  }

  try {
    return Response.json(await getDistanceMatrixCoverage(zoneId));
  } catch {
    return Response.json(
      { error: "No se pudo consultar la cobertura de distancias." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const authError = await authorize(request);
  if (authError) return authError;

  const zoneId = zoneIdFromRequest(request);
  if (!zoneId) {
    return Response.json({ error: "Configura un ID de zona válido." }, { status: 400 });
  }

  try {
    return Response.json(await ensureDistanceMatrix(zoneId));
  } catch {
    return Response.json(
      { error: "No se pudo completar la matriz de distancias." },
      { status: 502 },
    );
  }
}