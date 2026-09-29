import { loadEnvConfig } from "@next/env";
import type {
  DistanceValue,
  RouteMetrics,
  RoutingRequest,
  RoutingVehicle,
} from "../lib/routing/cvrp";

async function main() {
  loadEnvConfig(process.cwd());

  const zoneId = process.env.NEXT_PUBLIC_RUTA_ZONA_ID;
  if (!zoneId) {
    throw new Error("Define NEXT_PUBLIC_RUTA_ZONA_ID en .env.local.");
  }

  const [{ getSupabaseAdminClient }, { ensureDistanceMatrix }, routing] =
    await Promise.all([
      import("../lib/supabase/admin"),
      import("../lib/distances/matrix"),
      import("../lib/routing/cvrp"),
    ]);
  const coverage = await ensureDistanceMatrix(zoneId);
  if (coverage.pares_pendientes > 0) {
    throw new Error(
      `La matriz aún tiene ${coverage.pares_pendientes} pares pendientes.`,
    );
  }

  const supabase = getSupabaseAdminClient();
  const [zoneResult, parametersResult, requestsResult, vehiclesResult] =
    await Promise.all([
      supabase.from("zonas").select("id, nombre, es_demo").eq("id", zoneId).single(),
      supabase
        .from("parametros")
        .select(
          "deposito_id, deposito_latitud, deposito_longitud, rendimiento_vehiculo_km_l, precio_combustible_por_litro, minutos_fijos_por_parada",
        )
        .eq("zona_id", zoneId)
        .single(),
      supabase
        .from("solicitudes")
        .select("id, colonia, kg_estimados, created_at, latitud, longitud")
        .eq("zona_id", zoneId)
        .in("estado", ["pendiente", "asignada", "sin_asignar"])
        .order("id"),
      supabase
        .from("vehiculos")
        .select("id, nombre, capacidad_kg")
        .eq("zona_id", zoneId)
        .eq("disponible", true)
        .order("id"),
    ]);

  if (zoneResult.error || !zoneResult.data) {
    throw new Error("No se encontró la zona para la comparación.");
  }
  if (parametersResult.error || !parametersResult.data) {
    throw new Error("No se encontraron parámetros para la zona.");
  }
  if (requestsResult.error || !requestsResult.data) {
    throw new Error("No se pudieron leer las solicitudes activas.");
  }
  if (vehiclesResult.error || !vehiclesResult.data) {
    throw new Error("No se pudieron leer los vehículos disponibles.");
  }

  const parameters = parametersResult.data;
  const depotId = parameters.deposito_id;
  const requests: RoutingRequest[] = requestsResult.data.map((request) => ({
    id: request.id,
    colonia: request.colonia,
    kgEstimados: request.kg_estimados,
    createdAt: request.created_at,
    latitude: request.latitud,
    longitude: request.longitud,
  }));
  const vehicles: RoutingVehicle[] = vehiclesResult.data.map((vehicle) => ({
    id: vehicle.id,
    name: vehicle.nombre,
    capacityKg: vehicle.capacidad_kg,
  }));

  const nodeTypes = new Map<string, "deposito" | "solicitud">([
    [depotId, "deposito"],
    ...requests.map((request) => [request.id, "solicitud"] as const),
  ]);
  const distanceByPair = new Map<string, DistanceValue>();

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("matriz_distancias")
      .select("origen_tipo, origen_id, destino_tipo, destino_id, metros, segundos")
      .eq("zona_id", zoneId)
      .range(offset, offset + 999);

    if (error || !data) throw new Error("No se pudo leer la matriz para comparar rutas.");

    for (const entry of data) {
      if (!nodeTypes.has(entry.origen_id) || !nodeTypes.has(entry.destino_id)) continue;
      const key = JSON.stringify([
        entry.origen_tipo,
        entry.origen_id,
        entry.destino_tipo,
        entry.destino_id,
      ]);
      distanceByPair.set(key, { meters: entry.metros, seconds: entry.segundos });
    }

    if (data.length < 1000) break;
  }

  const plan = routing.buildRoutingPlan({
    depot: {
      id: depotId,
      latitude: parameters.deposito_latitud,
      longitude: parameters.deposito_longitud,
    },
    requests,
    vehicles,
    parameters: {
      fuelEfficiencyKmPerLiter: parameters.rendimiento_vehiculo_km_l,
      fuelPricePerLiter: parameters.precio_combustible_por_litro,
      fixedStopMinutes: parameters.minutos_fijos_por_parada,
    },
    distanceBetween(originId, destinationId) {
      const originType = nodeTypes.get(originId);
      const destinationType = nodeTypes.get(destinationId);
      if (!originType || !destinationType) {
        throw new Error(`No se encontró el tipo del par ${originId} -> ${destinationId}.`);
      }

      const key = JSON.stringify([
        originType,
        originId,
        destinationType,
        destinationId,
      ]);
      const distance = distanceByPair.get(key);
      if (!distance) throw new Error(`Falta la distancia ${originId} -> ${destinationId}.`);
      return distance;
    },
  });

  const scenarios: Array<{ name: string; metrics: RouteMetrics }> = [
    { name: "Optimizada RutaSmart", metrics: plan.optimized.metrics },
    { name: "Orden de registro", metrics: plan.byRegistration.metrics },
    { name: "Orden por colonia", metrics: plan.byColony.metrics },
  ];
  const rows = scenarios.map(({ name, metrics }) => ({
    escenario: name,
    kilometros: Number(metrics.kilometers.toFixed(2)),
    minutos: Number(metrics.minutes.toFixed(1)),
    litros: Number(metrics.liters.toFixed(2)),
    costo_combustible: Number(metrics.fuelCost.toFixed(2)),
    costo_por_kg: Number(metrics.costPerKg.toFixed(2)),
    kg_por_km: Number(metrics.kgPerKm.toFixed(2)),
    kg_por_hora: Number(metrics.kgPerHour.toFixed(2)),
  }));

  console.log(`Zona: ${zoneResult.data.nombre}${zoneResult.data.es_demo ? " (demo)" : ""}`);
  console.log(`Solicitudes activas: ${requests.length}; vehículos disponibles: ${vehicles.length}`);
  console.log("Cobertura de distancias:", JSON.stringify(coverage));
  console.table(rows);
  if (plan.unassigned.length > 0) {
    console.log("Solicitudes sin asignar:");
    console.table(
      plan.unassigned.map((request) => ({
        id: request.id,
        colonia: request.colonia,
        kg_estimados: request.kgEstimados,
      })),
    );
  } else {
    console.log("Solicitudes sin asignar: 0");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Error desconocido.";
  console.error(`No se pudo comparar las rutas: ${message}`);
  process.exitCode = 1;
});