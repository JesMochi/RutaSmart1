import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMissingDistanceEntries,
  type DistanceEntry,
  type DistanceNode,
  type RoutingOptions,
} from "./osrm";

const nodes: DistanceNode[] = [
  { id: "depot", tipo: "deposito", latitude: 19.601, longitude: -99.032 },
  { id: "stop-a", tipo: "solicitud", latitude: 19.602, longitude: -99.031 },
];

const routingOptions: RoutingOptions = {
  adjustmentFactor: 1.3,
  averageSpeedKmH: 25,
  osrmBaseUrl: "https://osrm.example.test",
  retries: 0,
  retryDelayMs: 0,
};

function tableResponse(
  distances: Array<Array<number | null>>,
  durations: Array<Array<number | null>>,
): Response {
  return Response.json({ code: "Ok", distances, durations });
}

test("usa las distancias y duraciones devueltas por OSRM Table", async () => {
  const entries = await calculateMissingDistanceEntries(nodes, [], {
    ...routingOptions,
    fetcher: async () =>
      tableResponse(
        [
          [0, 1250],
          [1320, 0],
        ],
        [
          [0, 180],
          [195, 0],
        ],
      ),
  });

  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map(({ metros, segundos, fuente }) => ({ metros, segundos, fuente })),
    [
      { metros: 1250, segundos: 180, fuente: "osrm" },
      { metros: 1320, segundos: 195, fuente: "osrm" },
    ],
  );
});

test("no recalcula pares dirigidos ya guardados", async () => {
  const savedPair: DistanceEntry = {
    origen_tipo: "deposito",
    origen_id: "depot",
    destino_tipo: "solicitud",
    destino_id: "stop-a",
    metros: 1000,
    segundos: 120,
    fuente: "osrm",
  };
  let requestCount = 0;

  const entries = await calculateMissingDistanceEntries(nodes, [savedPair], {
    ...routingOptions,
    fetcher: async () => {
      requestCount += 1;
      return tableResponse([[0, 1400], [1450, 0]], [[0, 200], [205, 0]]);
    },
  });

  assert.equal(requestCount, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].origen_id, "stop-a");
  assert.equal(entries[0].destino_id, "depot");
});

test("divide matrices grandes en bloques", async () => {
  const threeNodes = [
    ...nodes,
    { id: "stop-b", tipo: "solicitud" as const, latitude: 19.603, longitude: -99.03 },
  ];
  let requestCount = 0;

  const entries = await calculateMissingDistanceEntries(threeNodes, [], {
    ...routingOptions,
    batchSize: 2,
    fetcher: async (input) => {
      requestCount += 1;
      const url = new URL(String(input));
      const sourceCount = url.searchParams.get("sources")!.split(";").length;
      const destinationCount = url.searchParams.get("destinations")!.split(";").length;
      return tableResponse(
        Array.from({ length: sourceCount }, () => Array(destinationCount).fill(1000)),
        Array.from({ length: sourceCount }, () => Array(destinationCount).fill(100)),
      );
    },
  });

  assert.equal(requestCount, 3);
  assert.equal(entries.length, 6);
});

test("reintenta solicitudes fallidas y después usa Haversine", async () => {
  let requestCount = 0;

  const entries = await calculateMissingDistanceEntries(nodes, [], {
    ...routingOptions,
    retries: 2,
    fetcher: async () => {
      requestCount += 1;
      throw new Error("OSRM no disponible");
    },
  });

  assert.equal(requestCount, 3);
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => entry.fuente === "haversine"));
});

test("completa con Haversine una celda sin ruta de OSRM", async () => {
  const entries = await calculateMissingDistanceEntries(nodes, [], {
    ...routingOptions,
    fetcher: async () =>
      tableResponse(
        [
          [0, null],
          [1320, 0],
        ],
        [
          [0, null],
          [195, 0],
        ],
      ),
  });

  assert.deepEqual(
    entries.map((entry) => entry.fuente),
    ["haversine", "osrm"],
  );
});