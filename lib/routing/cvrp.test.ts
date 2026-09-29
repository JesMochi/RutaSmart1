import assert from "node:assert/strict";
import test from "node:test";
import {
  assignByAngularSweep,
  buildRoutingPlan,
  nearestNeighborRoute,
  twoOptImprove,
  type DistanceLookup,
  type RoutingInput,
  type RoutingRequest,
} from "./cvrp";

function point(
  id: string,
  latitude: number,
  longitude: number,
  kgEstimados = 1,
  createdAt = "2026-09-29T10:00:00.000Z",
  colonia = "Centro",
): RoutingRequest {
  return { id, latitude, longitude, kgEstimados, createdAt, colonia };
}

const points = [
  point("a", 19.601, -99.031, 6, "2026-09-29T10:00:00.000Z", "Cedros"),
  point("b", 19.602, -99.031, 4, "2026-09-29T10:01:00.000Z", "Robles"),
  point("c", 19.601, -99.033, 7, "2026-09-29T10:02:00.000Z", "Robles"),
  point("d", 19.599, -99.032, 1, "2026-09-29T10:03:00.000Z", "Cedros"),
];

const coordinates = new Map<string, { latitude: number; longitude: number }>([
  ["depot", { latitude: 19.6, longitude: -99.032 }],
  ...points.map(({ id, latitude, longitude }) => [id, { latitude, longitude }] as const),
]);

const euclideanDistance: DistanceLookup = (originId, destinationId) => {
  const origin = coordinates.get(originId);
  const destination = coordinates.get(destinationId);
  if (!origin || !destination) throw new Error("Falta una distancia de prueba.");
  const meters = Math.round(
    Math.hypot(
      (origin.latitude - destination.latitude) * 111_000,
      (origin.longitude - destination.longitude) * 105_000,
    ),
  );
  return { meters, seconds: Math.round((meters / 1000 / 25) * 3600) };
};

function input(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    depot: { id: "depot", latitude: 19.6, longitude: -99.032 },
    requests: points,
    vehicles: [
      { id: "vehicle-1", name: "Vehículo 1", capacityKg: 10 },
      { id: "vehicle-2", name: "Vehículo 2", capacityKg: 10 },
    ],
    parameters: {
      fuelEfficiencyKmPerLiter: 8,
      fuelPricePerLiter: 24.5,
      fixedStopMinutes: 8,
    },
    distanceBetween: euclideanDistance,
    ...overrides,
  };
}

function routeMeters(
  depotId: string,
  route: RoutingRequest[],
  distanceBetween: DistanceLookup,
): number {
  if (route.length === 0) return 0;
  const legs = [depotId, ...route.map((stop) => stop.id), depotId];
  return legs.slice(1).reduce(
    (total, destinationId, index) =>
      total + distanceBetween(legs[index], destinationId).meters,
    0,
  );
}

test("el barrido angular llena por capacidad y respeta dos vehículos", () => {
  const result = assignByAngularSweep(input().depot, points, input().vehicles);

  assert.deepEqual(
    result.assignments.map((assignment) => assignment.loadKg).sort((a, b) => a - b),
    [8, 10],
  );
  assert.equal(result.unassigned.length, 0);
  assert.ok(
    result.assignments.every(
      (assignment) => assignment.loadKg <= assignment.vehicle.capacityKg,
    ),
  );
});

test("las solicitudes que exceden toda capacidad quedan visibles sin asignar", () => {
  const tooHeavy = point("heavy", 19.6, -99.03, 25);
  const result = assignByAngularSweep(input().depot, [tooHeavy], input().vehicles);

  assert.deepEqual(result.unassigned.map((request) => request.id), ["heavy"]);
  assert.ok(result.assignments.every((assignment) => assignment.requests.length === 0));
});

test("vecino más cercano y 2-opt producen una ruta que no empeora", () => {
  const start = [points[0], points[2], points[1], points[3]];
  const nearest = nearestNeighborRoute("depot", start, euclideanDistance);
  const improved = twoOptImprove("depot", nearest, euclideanDistance);

  assert.ok(
    routeMeters("depot", improved, euclideanDistance) <=
      routeMeters("depot", nearest, euclideanDistance),
  );
});

test("cada solicitud queda asignada o aparece una vez como sin asignar", () => {
  const requests = [...points, point("overweight", 19.6, -99.03, 30)];
  const plan = buildRoutingPlan(input({ requests }));
  const representedIds = [
    ...plan.optimized.routes.flatMap((route) => route.stops.map((stop) => stop.id)),
    ...plan.unassigned.map((request) => request.id),
  ];

  assert.equal(new Set(representedIds).size, requests.length);
  assert.deepEqual(new Set(representedIds), new Set(requests.map((request) => request.id)));
  assert.deepEqual(plan.unassigned.map((request) => request.id), ["overweight"]);
});

test("ambas líneas base comparan los mismos puntos y respetan capacidad", () => {
  const plan = buildRoutingPlan(input());
  const expectedIds = new Set(
    plan.optimized.routes.flatMap((route) => route.stops.map((stop) => stop.id)),
  );

  for (const scenario of [plan.byRegistration, plan.byColony]) {
    assert.deepEqual(
      new Set(scenario.routes.flatMap((route) => route.stops.map((stop) => stop.id))),
      expectedIds,
    );
    assert.ok(
      scenario.routes.every((route) => route.estimatedKg <= route.vehicle.capacityKg),
    );
  }
});

test("la línea base por colonia ordena colonias y conserva registro dentro de ellas", () => {
  const plan = buildRoutingPlan(input());
  for (const route of plan.byColony.routes) {
    const colonies = route.stops.map((request) => request.colonia);
    assert.deepEqual(
      colonies,
      [...colonies].sort((first, second) => first.localeCompare(second, "es-MX")),
    );

    const withinCedros = route.stops
      .filter((request) => request.colonia === "Cedros")
      .map((request) => request.id);
    const expectedCedros = [...withinCedros].sort((firstId, secondId) =>
      points
        .find((request) => request.id === firstId)!
        .createdAt.localeCompare(
          points.find((request) => request.id === secondId)!.createdAt,
        ),
    );
    assert.deepEqual(withinCedros, expectedCedros);
  }
});

test("el plan es determinista y sus métricas incluyen traslados y paradas", () => {
  const first = buildRoutingPlan(input());
  const second = buildRoutingPlan(input({ requests: [...points].reverse() }));

  assert.deepEqual(first, second);
  assert.ok(first.optimized.metrics.minutes > 0);
  assert.ok(first.optimized.metrics.fuelCost > 0);
  assert.ok(first.optimized.metrics.kgPerHour > 0);
});

test("rechaza una flota mayor al máximo permitido", () => {
  assert.throws(
    () =>
      buildRoutingPlan(
        input({
          vehicles: [
            { id: "1", name: "1", capacityKg: 10 },
            { id: "2", name: "2", capacityKg: 10 },
            { id: "3", name: "3", capacityKg: 10 },
          ],
        }),
      ),
    RangeError,
  );
});

test("calcula todas las métricas de una ruta incluyendo regreso y parada", () => {
  const request = point("single", 19.601, -99.031, 5);
  const plan = buildRoutingPlan(
    input({
      requests: [request],
      vehicles: [{ id: "vehicle-1", name: "Vehículo 1", capacityKg: 10 }],
      distanceBetween: () => ({ meters: 1000, seconds: 60 }),
    }),
  );

  assert.deepEqual(plan.optimized.metrics, {
    kilometers: 2,
    minutes: 10,
    liters: 0.25,
    fuelCost: 6.125,
    costPerKg: 1.225,
    kgPerKm: 2.5,
    kgPerHour: 30,
  });
});