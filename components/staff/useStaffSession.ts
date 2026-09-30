"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type StaffProfile = Pick<
  Database["public"]["Tables"]["perfiles"]["Row"],
  "user_id" | "nombre" | "rol"
>;

export type StaffSession =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "no-profile"; user: User }
  | { status: "error"; message: string }
  | { status: "ready"; user: User; profile: StaffProfile };

async function resolveSession(user: User | null): Promise<StaffSession> {
  if (!user) return { status: "signed-out" };

  // RLS solo deja leer el propio perfil (o todos, si es administrador).
  const { data, error } = await getSupabaseClient()
    .from("perfiles")
    .select("user_id, nombre, rol")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { status: "error", message: "No se pudo consultar tu perfil." };
  if (!data) return { status: "no-profile", user };
  return { status: "ready", user, profile: data };
}

export function useStaffSession(): StaffSession {
  const [session, setSession] = useState<StaffSession>(() => {
    try {
      getSupabaseClient();
      return { status: "loading" };
    } catch {
      return { status: "error", message: "Supabase no está configurado." };
    }
  });

  useEffect(() => {
    let active = true;
    let supabase: ReturnType<typeof getSupabaseClient>;

    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (event === "TOKEN_REFRESHED") return;
      // Se difiere la consulta: llamar a Supabase dentro del callback puede bloquear la sesión.
      setTimeout(() => {
        void resolveSession(authSession?.user ?? null).then((next) => {
          if (active) setSession(next);
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return session;
}

export async function signOut(): Promise<void> {
  await getSupabaseClient().auth.signOut();
}
