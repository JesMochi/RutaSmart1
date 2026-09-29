import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());

  const { ensureDistanceMatrix } = await import("../lib/distances/matrix");
  const zoneId = process.env.NEXT_PUBLIC_RUTA_ZONA_ID;

  if (!zoneId) {
    throw new Error("Define NEXT_PUBLIC_RUTA_ZONA_ID en .env.local.");
  }

  const coverage = await ensureDistanceMatrix(zoneId);
  console.log(JSON.stringify(coverage, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Error desconocido.";
  console.error(`No se pudo precargar la matriz: ${message}`);
  process.exitCode = 1;
});