import { getSupabaseClient } from "@/lib/supabase/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await getSupabaseClient()
      .from("impacto_publico")
      .select("kg_recolectados, combustible_ahorrado_litros")
      .single();

    if (error || !data) throw new Error("No se pudo leer el impacto.");

    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Indicadores temporalmente no disponibles." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}