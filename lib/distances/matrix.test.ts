import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMatrixCoverage } from "./matrix-coverage";
import type { DistanceEntry, DistanceNode } from "./osrm";

const nodes: DistanceNode[] = [
  { id: "depot", tipo: "deposito", latitude: 19.601, longitude: -99.032 },
  { id: "stop-a", tipo: "solicitud", latitude: 19.602, longitude: -99.031 },
  { id: "stop-b", tipo: "solicitud", latitude: 19.603, longitude: -99.03 },
];

function entry(
  origin: DistanceNode,
  destination: DistanceNode,
  source: DistanceEntry["fuente"],
): DistanceEntry {
  return {
    origen_tipo: origin.tipo,
    origen_id: origin.id,
    destino_tipo: destination.tipo,
    destino_id: destination.id,
    metros: 1000,
    segundos: 120,
    fuente: source,
  };
}

test("calcula cobertura de fuentes y pares faltantes", () => {
  const summary = summarizeMatrixCoverage(nodes, [
    entry(nodes[0], nodes[1], "osrm"),
    entry(nodes[1], nodes[0], "osrm"),
    entry(nodes[0], nodes[2], "haversine"),
  ]);

  assert.deepEqual(summary, {
    nodos: 3,
    pares_requeridos: 6,
    pares_calculados: 3,
    pares_pendientes: 3,
    pares_osrm: 2,
    pares_haversine: 1,
    porcentaje_osrm: 33.3,
    porcentaje_haversine: 16.7,
  });
});

test("ignora distancias guardadas para solicitudes fuera del conjunto activo", () => {
  const summary = summarizeMatrixCoverage(nodes.slice(0, 2), [
    entry(nodes[0], nodes[1], "osrm"),
    entry(nodes[1], nodes[0], "osrm"),
    entry(nodes[0], nodes[2], "haversine"),
  ]);

  assert.equal(summary.pares_calculados, 2);
  assert.equal(summary.pares_pendientes, 0);
  assert.equal(summary.porcentaje_osrm, 100);
});