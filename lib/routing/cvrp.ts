export interface RoutingRequest {
  id: string;
  colonia: string;
  kgEstimados: number;
  createdAt: string;
  latitude: number;
  longitude: number;
}

export interface RoutingVehicle {
  id: string;
  name: string;
  capacityKg: number;
}

export interface RoutingDepot {
  id: string;
  latitude: number;
  longitude: number;
}

export interface RoutingParameters {
  fuelEfficiencyKmPerLiter: number;
  fuelPricePerLiter: number;
  fixedStopMinutes: number;
}

export interface DistanceValue {
  meters: number;
  seconds: number;
}

export type DistanceLookup = (
  originId: string,
  destinationId: string,
) => DistanceValue;

export interface RouteMetrics {
  kilometers: number;
  minutes: number;
  liters: number;
  fuelCost: number;
  costPerKg: number;
  kgPerKm: number;
  kgPerHour: number;
}

export interface VehicleRoute {
  vehicle: RoutingVehicle;
  stops: RoutingRequest[];
  estimatedKg: number;
  capacityUsedPercent: number;
  metrics: RouteMetrics;
}

export interface RoutingScenario {
  routes: VehicleRoute[];
  metrics: RouteMetrics;
}

export interface RoutingPlan {
  optimized: RoutingScenario;
  byRegistration: RoutingScenario;
  byColony: RoutingScenario;
  unassigned: RoutingRequest[];
}

export interface RoutingInput {
  depot: RoutingDepot;
  requests: RoutingRequest[];
  vehicles: RoutingVehicle[];
  parameters: RoutingParameters;
  distanceBetween: DistanceLookup;
}

interface Assignment {
  vehicle: RoutingVehicle;
  requests: RoutingRequest[];
  loadKg: number;
}

function validateCoordinates(latitude: number, longitude: number, label: string) {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError(`${label} tiene coordenadas inválidas.`);
  }
}

function validateInput(input: RoutingInput): void {
  validateCoordinates(input.depot.latitude, input.depot.longitude, "El depósito");

  if (input.vehicles.length > 2) {
    throw new RangeError("RutaSmart permite como máximo dos vehículos por ruta.");
  }

  if (
    !Number.isFinite(input.parameters.fuelEfficiencyKmPerLiter) ||
    input.parameters.fuelEfficiencyKmPerLiter <= 0 ||
    !Number.isFinite(input.parameters.fuelPricePerLiter) ||
    input.parameters.fuelPricePerLiter < 0 ||
    !Number.isFinite(input.parameters.fixedStopMinutes) ||
    input.parameters.fixedStopMinutes < 0
  ) {
    throw new RangeError("Los parámetros de combustible y parada no son válidos.");
  }

  const requestIds = new Set<string>();
  for (const request of input.requests) {
    if (!request.id || requestIds.has(request.id)) {
      throw new Error(`La solicitud ${request.id || "sin ID"} está duplicada o vacía.`);
    }
    requestIds.add(request.id);
    validateCoordinates(request.latitude, request.longitude, request.id);

    if (!Number.isFinite(request.kgEstimados) || request.kgEstimados <= 0) {
      throw new RangeError(`La solicitud ${request.id} debe tener kilos positivos.`);
    }
    if (!Number.isFinite(Date.parse(request.createdAt))) {
      throw new RangeError(`La fecha de registro de ${request.id} no es válida.`);
    }
  }

  const vehicleIds = new Set<string>();
  for (const vehicle of input.vehicles) {
    if (!vehicle.id || vehicleIds.has(vehicle.id)) {
      throw new Error(`El vehículo ${vehicle.id || "sin ID"} está duplicado o vacío.`);
    }
    vehicleIds.add(vehicle.id);
    if (!Number.isFinite(vehicle.capacityKg) || vehicle.capacityKg <= 0) {
      throw new RangeError(`El vehículo ${vehicle.name} debe tener capacidad positiva.`);
    }
  }
}

function compareRegistration(
  first: RoutingRequest,
  second: RoutingRequest,
): number {
  return first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id);
}

function angularSweepOrder(
  depot: RoutingDepot,
  requests: RoutingRequest[],
): RoutingRequest[] {
  const longitudeScale = Math.cos((depot.latitude * Math.PI) / 180);
  const angleFor = (request: RoutingRequest) => {
    const longitudeDelta =
      ((request.longitude - depot.longitude + 540) % 360) - 180;
    const x = longitudeDelta * longitudeScale;
    const y = request.latitude - depot.latitude;
    return Math.atan2(y, x);
  };

  return [...requests].sort(
    (first, second) =>
      angleFor(first) - angleFor(second) || compareRegistration(first, second),
  );
}

export function assignByAngularSweep(
  depot: RoutingDepot,
  requests: RoutingRequest[],
  vehicles: RoutingVehicle[],
): { assignments: Assignment[]; unassigned: RoutingRequest[] } {
  // Se recorre el ángulo alrededor del depósito y se corta al saturar cada unidad.
  const orderedRequests = angularSweepOrder(depot, requests);
  const orderedVehicles = [...vehicles].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
  const assignments: Assignment[] = orderedVehicles.map((vehicle) => ({
    vehicle,
    requests: [],
    loadKg: 0,
  }));
  const unassigned: RoutingRequest[] = [];
  let currentVehicleIndex = 0;

  for (const request of orderedRequests) {
    let assigned = false;

    while (currentVehicleIndex < assignments.length) {
      const assignment = assignments[currentVehicleIndex];
      if (assignment.loadKg + request.kgEstimados <= assignment.vehicle.capacityKg) {
        assignment.requests.push(request);
        assignment.loadKg += request.kgEstimados;
        assigned = true;
        break;
      }
      currentVehicleIndex += 1;
    }

    if (!assigned) {
      for (let index = 0; index < assignments.length; index += 1) {
        const assignment = assignments[index];
        if (assignment.loadKg + request.kgEstimados <= assignment.vehicle.capacityKg) {
          assignment.requests.push(request);
          assignment.loadKg += request.kgEstimados;
          assigned = true;
          break;
        }
      }
    }

    if (!assigned) unassigned.push(request);
  }

  // Un intercambio local evita perder una parada si la primera partición deja capacidad fragmentada.
  const remainingUnassigned: RoutingRequest[] = [];
  for (const request of unassigned) {
    let reassigned = false;

    for (let targetIndex = 0; targetIndex < assignments.length && !reassigned; targetIndex += 1) {
      const target = assignments[targetIndex];
      for (let requestIndex = 0; requestIndex < target.requests.length; requestIndex += 1) {
        const displaced = target.requests[requestIndex];
        const other = assignments.find(
          (assignment, index) =>
            index !== targetIndex &&
            assignment.loadKg + displaced.kgEstimados <= assignment.vehicle.capacityKg,
        );

        if (
          target.loadKg - displaced.kgEstimados + request.kgEstimados <=
            target.vehicle.capacityKg &&
          other
        ) {
          target.requests[requestIndex] = request;
          target.loadKg += request.kgEstimados - displaced.kgEstimados;
          other.requests.push(displaced);
          other.loadKg += displaced.kgEstimados;
          reassigned = true;
          break;
        }
      }
    }

    if (!reassigned) remainingUnassigned.push(request);
  }

  return { assignments, unassigned: remainingUnassigned };
}

function getDistance(
  distanceBetween: DistanceLookup,
  originId: string,
  destinationId: string,
): DistanceValue {
  const distance = distanceBetween(originId, destinationId);
  if (
    !Number.isFinite(distance.meters) ||
    distance.meters < 0 ||
    !Number.isFinite(distance.seconds) ||
    distance.seconds < 0
  ) {
    throw new RangeError(`La distancia ${originId} -> ${destinationId} no es válida.`);
  }
  return distance;
}

function routeMeters(
  depotId: string,
  stops: RoutingRequest[],
  distanceBetween: DistanceLookup,
): number {
  if (stops.length === 0) return 0;

  let totalMeters = 0;
  let originId = depotId;
  for (const stop of stops) {
    totalMeters += getDistance(distanceBetween, originId, stop.id).meters;
    originId = stop.id;
  }
  totalMeters += getDistance(distanceBetween, originId, depotId).meters;
  return totalMeters;
}

export function nearestNeighborRoute(
  depotId: string,
  requests: RoutingRequest[],
  distanceBetween: DistanceLookup,
): RoutingRequest[] {
  const remaining = [...requests];
  const ordered: RoutingRequest[] = [];
  let currentId = depotId;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const distance = getDistance(distanceBetween, currentId, candidate.id).meters;
      if (
        distance < nearestDistance ||
        (distance === nearestDistance && candidate.id < remaining[nearestIndex].id)
      ) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    const [next] = remaining.splice(nearestIndex, 1);
    ordered.push(next);
    currentId = next.id;
  }

  return ordered;
}

export function twoOptImprove(
  depotId: string,
  initialRoute: RoutingRequest[],
  distanceBetween: DistanceLookup,
): RoutingRequest[] {
  // Se invierte un tramo solo cuando mejora el recorrido completo, incluido el regreso.
  let route = [...initialRoute];
  let bestDistance = routeMeters(depotId, route, distanceBetween);
  let improved = true;

  while (improved) {
    improved = false;
    let bestCandidate = route;

    for (let start = 0; start < route.length - 1; start += 1) {
      for (let end = start + 1; end < route.length; end += 1) {
        const candidate = [
          ...route.slice(0, start),
          ...route.slice(start, end + 1).reverse(),
          ...route.slice(end + 1),
        ];
        const candidateDistance = routeMeters(depotId, candidate, distanceBetween);
        if (candidateDistance < bestDistance - 1e-9) {
          bestDistance = candidateDistance;
          bestCandidate = candidate;
          improved = true;
        }
      }
    }

    if (improved) route = bestCandidate;
  }

  return route;
}

function calculateRouteMetrics(
  depotId: string,
  stops: RoutingRequest[],
  parameters: RoutingParameters,
  distanceBetween: DistanceLookup,
): RouteMetrics {
  let travelMeters = 0;
  let travelSeconds = 0;
  let originId = depotId;

  for (const stop of stops) {
    const distance = getDistance(distanceBetween, originId, stop.id);
    travelMeters += distance.meters;
    travelSeconds += distance.seconds;
    originId = stop.id;
  }

  if (stops.length > 0) {
    const returnDistance = getDistance(distanceBetween, originId, depotId);
    travelMeters += returnDistance.meters;
    travelSeconds += returnDistance.seconds;
  }

  const kilometers = travelMeters / 1000;
  const minutes = travelSeconds / 60 + stops.length * parameters.fixedStopMinutes;
  const estimatedKg = stops.reduce((total, stop) => total + stop.kgEstimados, 0);
  const liters = kilometers / parameters.fuelEfficiencyKmPerLiter;
  const fuelCost = liters * parameters.fuelPricePerLiter;
  const hours = minutes / 60;

  return {
    kilometers,
    minutes,
    liters,
    fuelCost,
    costPerKg: estimatedKg === 0 ? 0 : fuelCost / estimatedKg,
    kgPerKm: kilometers === 0 ? 0 : estimatedKg / kilometers,
    kgPerHour: hours === 0 ? 0 : estimatedKg / hours,
  };
}

function buildScenario(
  assignments: Assignment[],
  orderRequests: (requests: RoutingRequest[]) => RoutingRequest[],
  input: RoutingInput,
): RoutingScenario {
  const routes = assignments.map(({ vehicle, requests }) => {
    const stops = orderRequests(requests);
    const estimatedKg = stops.reduce((total, stop) => total + stop.kgEstimados, 0);

    return {
      vehicle,
      stops,
      estimatedKg,
      capacityUsedPercent: (estimatedKg / vehicle.capacityKg) * 100,
      metrics: calculateRouteMetrics(
        input.depot.id,
        stops,
        input.parameters,
        input.distanceBetween,
      ),
    };
  });

  const totalKg = routes.reduce((total, route) => total + route.estimatedKg, 0);
  const totalKilometers = routes.reduce(
    (total, route) => total + route.metrics.kilometers,
    0,
  );
  const totalMinutes = routes.reduce((total, route) => total + route.metrics.minutes, 0);
  const totalLiters = routes.reduce((total, route) => total + route.metrics.liters, 0);
  const totalFuelCost = routes.reduce((total, route) => total + route.metrics.fuelCost, 0);
  const totalHours = totalMinutes / 60;

  return {
    routes,
    metrics: {
      kilometers: totalKilometers,
      minutes: totalMinutes,
      liters: totalLiters,
      fuelCost: totalFuelCost,
      costPerKg: totalKg === 0 ? 0 : totalFuelCost / totalKg,
      kgPerKm: totalKilometers === 0 ? 0 : totalKg / totalKilometers,
      kgPerHour: totalHours === 0 ? 0 : totalKg / totalHours,
    },
  };
}

export function buildRoutingPlan(input: RoutingInput): RoutingPlan {
  validateInput(input);

  const { assignments, unassigned } = assignByAngularSweep(
    input.depot,
    input.requests,
    input.vehicles,
  );

  const optimized = buildScenario(
    assignments,
    (requests) =>
      twoOptImprove(
        input.depot.id,
        nearestNeighborRoute(input.depot.id, requests, input.distanceBetween),
        input.distanceBetween,
      ),
    input,
  );
  const byRegistration = buildScenario(
    assignments,
    (requests) => [...requests].sort(compareRegistration),
    input,
  );
  const byColony = buildScenario(
    assignments,
    (requests) =>
      [...requests].sort(
        (first, second) =>
          first.colonia.localeCompare(second.colonia, "es-MX") ||
          compareRegistration(first, second),
      ),
    input,
  );

  const expectedRequestIds = new Set(input.requests.map((request) => request.id));
  const representedRequestIds = new Set([
    ...optimized.routes.flatMap((route) => route.stops.map((stop) => stop.id)),
    ...unassigned.map((request) => request.id),
  ]);
  if (
    representedRequestIds.size !== expectedRequestIds.size ||
    [...expectedRequestIds].some((requestId) => !representedRequestIds.has(requestId))
  ) {
    throw new Error("El plan no asignó ni reportó todas las solicitudes.");
  }

  return { optimized, byRegistration, byColony, unassigned };
}