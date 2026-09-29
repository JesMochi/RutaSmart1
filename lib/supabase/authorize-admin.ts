import "server-only";

import { getSupabaseAdminClient } from "./admin";

export type AdminAuthorization = "authorized" | "unauthenticated" | "forbidden";

export async function authorizeAdministrator(
  authorizationHeader: string | null,
): Promise<AdminAuthorization> {
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return "unauthenticated";

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return "unauthenticated";

  const { data: profile, error: profileError } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profileError || profile?.rol !== "administrador") return "forbidden";
  return "authorized";
}