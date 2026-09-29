import type { DistanceEntry, DistanceNode } from "./osrm";

export interface MatrixCoverage {
  nodos: number;
  pares_requeridos: number;
  pares_calculados: number;
  pares_pendientes: number;
  pares_osrm: number;
  pares_haversine: number;
  porcentaje_osrm: number;
  porcentaje_haversine: number;
}

export function summarizeMatrixCoverage(
  nodes: DistanceNode[],
  entries: DistanceEntry[],
): MatrixCoverage {
  const activeNodeKeys = new Set(nodes.map((node) => `${node.tipo}:${node.id}`));
  const relevantEntries = entries.filter(
    (entry) =>
      activeNodeKeys.has(`${entry.origen_tipo}:${entry.origen_id}`) &&
      activeNodeKeys.has(`${entry.destino_tipo}:${entry.destino_id}`),
  );
  const requiredPairs = nodes.length * Math.max(0, nodes.length - 1);
  const osrmPairs = relevantEntries.filter((entry) => entry.fuente === "osrm").length;
  const haversinePairs = relevantEntries.filter(
    (entry) => entry.fuente === "haversine",
  ).length;

  return {
    nodos: nodes.length,
    pares_requeridos: requiredPairs,
    pares_calculados: osrmPairs + haversinePairs,
    pares_pendientes: Math.max(0, requiredPairs - osrmPairs - haversinePairs),
    pares_osrm: osrmPairs,
    pares_haversine: haversinePairs,
    porcentaje_osrm:
      requiredPairs === 0 ? 0 : Number(((osrmPairs / requiredPairs) * 100).toFixed(1)),
    porcentaje_haversine:
      requiredPairs === 0
        ? 0
        : Number(((haversinePairs / requiredPairs) * 100).toFixed(1)),
  };
}