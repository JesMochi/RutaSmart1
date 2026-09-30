import "server-only";

import { getSupabaseAdminClient } from "./admin";

export type AdminAuthorization = "authorized" | "unauthenticated" | "forbidden";

export type AdministratorResolution =
  | { status: "authorized"; userId: string }
  | { status: "unauthenticated" | "forbidden" };

export async function resolveAdministrator(
  authorizationHeader: string | null,
): Promise<AdministratorResolution> {
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: "unauthenticated" };

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { status: "unauthenticated" };

  const { data: profile, error: profileError } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profileError || profile?.rol !== "administrador") return { status: "forbidden" };
  return { status: "authorized", userId: data.user.id };
}

export async function authorizeAdministrator(
  authorizationHeader: string | null,
): Promise<AdminAuthorization> {
  return (await resolveAdministrator(authorizationHeader)).status;
}
