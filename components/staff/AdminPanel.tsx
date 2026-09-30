"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Route as RouteIcon,
  XCircle,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { fallbackDurationSeconds, haversineDistanceMeters } from "@/lib/distances/haversine";
import { buildRoutingPlan, type DistanceValue } from "@/lib/routing/cvrp";
import {
  formatRouteDate,
  formatTimestamp,
  kgFormat,
  mapsUrl,
  REQUEST_STATE_LABELS,
  ROUTE_STATE_LABELS,
  todayIsoDate,
} from "./format";

type Tables = Database["public"]["Tables"];
type Request = Pick<
  Tables["solicitudes"]["Row"],
  | "id"
  | "colonia"
  | "direccion"
  | "latitud"
  | "longitud"
  | "material"
  | "kg_estimados"
  | "telefono"
  | "estado"
  | "created_at"
>;
type Vehicle = Pick<Tables["vehiculos"]["Row"], "id" | "nombre" | "capacidad_kg">;
type Collector = Pick<Tables["perfiles"]["Row"], "user_id" | "nombre">;
type Parameters = Pick<
  Tables["parametros"]["Row"],
  | "deposito_id"
  | "deposito_latitud"
  | "deposito_longitud"
  | "rendimiento_vehiculo_km_l"
  | "precio_combustible_por_litro"
  | "minutos_fijos_por_parada"
  | "velocidad_respaldo_km_h"
  | "factor_ajuste_linea_recta"
>;
type Route = Pick<
  Tables["rutas"]["Row"],
  "id" | "fecha" | "estado" | "kg_estimados" | "kilometros_totales" | "recolector_id" | "vehiculo_id"
>;
type Stop = Pick<Tables["paradas"]["Row"], "ruta_id" | "solicitud_id">;

interface AdminData {
  requests: Request[];
  vehicles: Vehicle[];
  collectors: Collector[];
  parameters: Parameters;
  routes: Route[];
  stops: Stop[];
}

type RequestFilter = "por-asignar" | Request["estado"] | "todas";

const ASSIGNABLE_STATES: ReadonlyArray<Request["estado"]> = ["pendiente", "sin_asignar"];

const FILTER_LABELS: Record<RequestFilter, string> = {
  "por-asignar": "Por asignar",
  pendiente: "Pendientes",
  sin_asignar: "Sin asignar",
  asignada: "Asignadas",
  recolectada: "Recolectadas",
  todas: "Todas",
};

function getZoneId(): string {
  const zoneId = process.env.NEXT_PUBLIC_RUTA_ZONA_ID;
  if (!zoneId) throw new Error("Configura NEXT_PUBLIC_RUTA_ZONA_ID.");
  return zoneId;
}

async function loadAdminData(): Promise<AdminData> {
  const supabase = getSupabaseClient();
  const zoneId = getZoneId();

  const [requests, vehicles, collectors, parameters, routes] = await Promise.all([
    supabase
      .from("solicitudes")
      .select(
        "id, colonia, direccion, latitud, longitud, material, kg_estimados, telefono, estado, created_at",
      )
      .eq("zona_id", zoneId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("vehiculos")
      .select("id, nombre, capacidad_kg")
      .eq("zona_id", zoneId)
      .eq("disponible", true)
      .order("nombre"),
    supabase
      .from("perfiles")
      .select("user_id, nombre")
      .eq("rol", "recolector")
      .eq("aprobado", true)
      .order("nombre"),
    supabase
      .from("parametros")
      .select(
        "deposito_id, deposito_latitud, deposito_longitud, rendimiento_vehiculo_km_l, precio_combustible_por_litro, minutos_fijos_por_parada, velocidad_respaldo_km_h, factor_ajuste_linea_recta",
      )
      .eq("zona_id", zoneId)
      .single(),
    supabase
      .from("rutas")
      .select("id, fecha, estado, kg_estimados, kilometros_totales, recolector_id, vehiculo_id")
      .eq("zona_id", zoneId)
      .in("estado", ["planeada", "en_curso"])
      .order("fecha")
      .order("created_at"),
  ]);

  if (requests.error || !requests.data) throw new Error("No se pudieron consultar las solicitudes.");
  if (vehicles.error || !vehicles.data) throw new Error("No se pudieron consultar los vehículos.");
  if (collectors.error || !collectors.data) throw new Error("No se pudieron consultar los recolectores.");
  if (parameters.error || !parameters.data) {
    throw new Error("La zona no tiene parámetros ni depósito configurados.");
  }
  if (routes.error || !routes.data) throw new Error("No se pudieron consultar las rutas.");

  const routeIds = routes.data.map((route) => route.id);
  const stops = routeIds.length
    ? await supabase.from("paradas").select("ruta_id, solicitud_id").in("ruta_id", routeIds)
    : { data: [] as Stop[], error: null };
  if (stops.error || !stops.data) throw new Error("No se pudieron consultar las paradas.");

  return {
    requests: requests.data,
    vehicles: vehicles.data,
    collectors: collectors.data,
    parameters: parameters.data,
    routes: routes.data,
    stops: stops.data,
  };
}

/** Usa la matriz guardada cuando existe el par y, si no, Haversine × factor de la zona. */
async function buildDistanceLookup(
  parameters: Parameters,
  requests: Request[],
): Promise<(originId: string, destinationId: string) => DistanceValue> {
  const nodes = new Map<string, { latitude: number; longitude: number }>([
    [parameters.deposito_id, { latitude: parameters.deposito_latitud, longitude: parameters.deposito_longitud }],
    ...requests.map((request) => [request.id, { latitude: request.latitud, longitude: request.longitud }] as const),
  ]);
  const nodeIds = [...nodes.keys()];
  const stored = new Map<string, DistanceValue>();

  const { data } = await getSupabaseClient()
    .from("matriz_distancias")
    .select("origen_id, destino_id, metros, segundos")
    .eq("zona_id", getZoneId())
    .in("origen_id", nodeIds)
    .in("destino_id", nodeIds);
  for (const entry of data ?? []) {
    stored.set(`${entry.origen_id}>${entry.destino_id}`, {
      meters: entry.metros,
      seconds: entry.segundos,
    });
  }

  return (originId, destinationId) => {
    if (originId === destinationId) return { meters: 0, seconds: 0 };
    const cached = stored.get(`${originId}>${destinationId}`);
    if (cached) return cached;

    const origin = nodes.get(originId);
    const destination = nodes.get(destinationId);
    if (!origin || !destination) throw new Error("Falta un punto para calcular la ruta.");
    const meters = haversineDistanceMeters(origin, destination, parameters.factor_ajuste_linea_recta);
    return { meters, seconds: fallbackDurationSeconds(meters, parameters.velocidad_respaldo_km_h) };
  };
}

async function createRoute(
  data: AdminData,
  selected: Request[],
  vehicle: Vehicle,
  collectorId: string,
  date: string,
): Promise<number> {
  const supabase = getSupabaseClient();
  const zoneId = getZoneId();
  const { parameters } = data;

  const plan = buildRoutingPlan({
    depot: {
      id: parameters.deposito_id,
      latitude: parameters.deposito_latitud,
      longitude: parameters.deposito_longitud,
    },
    requests: selected.map((request) => ({
      id: request.id,
      colonia: request.colonia,
      kgEstimados: request.kg_estimados,
      createdAt: request.created_at,
      latitude: request.latitud,
      longitude: request.longitud,
    })),
    vehicles: [{ id: vehicle.id, name: vehicle.nombre, capacityKg: vehicle.capacidad_kg }],
    parameters: {
      fuelEfficiencyKmPerLiter: parameters.rendimiento_vehiculo_km_l,
      fuelPricePerLiter: parameters.precio_combustible_por_litro,
      fixedStopMinutes: parameters.minutos_fijos_por_parada,
    },
    distanceBetween: await buildDistanceLookup(parameters, selected),
  });

  if (plan.unassigned.length > 0) {
    throw new Error("Las solicitudes seleccionadas superan la capacidad del vehículo.");
  }

  const optimized = plan.optimized.routes[0];
  const { data: route, error: routeError } = await supabase
    .from("rutas")
    .insert({
      zona_id: zoneId,
      vehiculo_id: vehicle.id,
      recolector_id: collectorId,
      fecha: date,
      estado: "planeada",
      capacidad_kg: vehicle.capacidad_kg,
      kg_estimados: optimized.estimatedKg,
      kilometros_totales: optimized.metrics.kilometers,
      minutos_estimados: optimized.metrics.minutes,
      litros_estimados: optimized.metrics.liters,
      costo_combustible: optimized.metrics.fuelCost,
      costo_por_kg: optimized.metrics.costPerKg,
      kg_por_km: optimized.metrics.kgPerKm,
      kg_por_hora: optimized.metrics.kgPerHour,
      km_base_registro: plan.byRegistration.metrics.kilometers,
      km_base_colonia: plan.byColony.metrics.kilometers,
    })
    .select("id")
    .single();
  if (routeError || !route) throw new Error("No se pudo crear la ruta.");

  const { error: stopsError } = await supabase.from("paradas").insert(
    optimized.stops.map((stop, index) => ({
      zona_id: zoneId,
      ruta_id: route.id,
      solicitud_id: stop.id,
      secuencia: index + 1,
    })),
  );
  if (stopsError) {
    // Las paradas se borran en cascada con la ruta.
    await supabase.from("rutas").delete().eq("id", route.id);
    throw new Error("No se pudieron guardar las paradas de la ruta.");
  }

  const { error: updateError } = await supabase
    .from("solicitudes")
    .update({ estado: "asignada" })
    .in("id", optimized.stops.map((stop) => stop.id));
  if (updateError) {
    throw new Error("La ruta se creó, pero no se pudo marcar las solicitudes como asignadas.");
  }

  return optimized.metrics.kilometers;
}

async function cancelRoute(routeId: string, requestIds: string[]): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("rutas")
    .update({ estado: "cancelada" })
    .eq("id", routeId);
  if (error) throw new Error("No se pudo cancelar la ruta.");

  if (requestIds.length > 0) {
    const { error: requestsError } = await supabase
      .from("solicitudes")
      .update({ estado: "pendiente" })
      .in("id", requestIds)
      .eq("estado", "asignada");
    if (requestsError) {
      throw new Error("La ruta se canceló, pero las solicitudes no volvieron a pendientes.");
    }
  }
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AdminData };

type Feedback = { kind: "success" | "error"; message: string } | null;

export function AdminPanel() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [filter, setFilter] = useState<RequestFilter>("por-asignar");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collectorId, setCollectorId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState(todayIsoDate);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const applyLoaded = useCallback((data: AdminData) => {
    setState({ status: "ready", data });
    // Conserva solo la selección que sigue siendo asignable tras recargar.
    setSelectedIds(
      (current) =>
        new Set(
          data.requests
            .filter((request) => current.has(request.id) && ASSIGNABLE_STATES.includes(request.estado))
            .map((request) => request.id),
        ),
    );
  }, []);

  const applyError = useCallback((error: unknown) => {
    setState({
      status: "error",
      message: error instanceof Error ? error.message : "No se pudo cargar el panel.",
    });
  }, []);

  const refresh = useCallback(
    () => loadAdminData().then(applyLoaded, applyError),
    [applyLoaded, applyError],
  );

  useEffect(() => {
    let active = true;
    loadAdminData().then(
      (data) => {
        if (active) applyLoaded(data);
      },
      (error: unknown) => {
        if (active) applyError(error);
      },
    );
    return () => {
      active = false;
    };
  }, [applyLoaded, applyError]);

  const data = state.status === "ready" ? state.data : null;

  const counts = useMemo(() => {
    const result: Record<Request["estado"], number> = {
      pendiente: 0,
      asignada: 0,
      recolectada: 0,
      sin_asignar: 0,
    };
    for (const request of data?.requests ?? []) result[request.estado] += 1;
    return result;
  }, [data]);

  const visibleRequests = useMemo(
    () =>
      (data?.requests ?? []).filter((request) =>
        filter === "todas"
          ? true
          : filter === "por-asignar"
            ? ASSIGNABLE_STATES.includes(request.estado)
            : request.estado === filter,
      ),
    [data, filter],
  );

  const selectedRequests = useMemo(
    () => (data?.requests ?? []).filter((request) => selectedIds.has(request.id)),
    [data, selectedIds],
  );
  const selectedKg = selectedRequests.reduce((total, request) => total + request.kg_estimados, 0);
  const selectedVehicle = data?.vehicles.find((vehicle) => vehicle.id === vehicleId);
  const overCapacity = selectedVehicle ? selectedKg > selectedVehicle.capacidad_kg : false;

  function toggleRequest(requestId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  }

  async function handleCreateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setFeedback(null);

    if (selectedRequests.length === 0) {
      setFeedback({ kind: "error", message: "Selecciona al menos una solicitud." });
      return;
    }
    if (!collectorId || !selectedVehicle || !date) {
      setFeedback({ kind: "error", message: "Elige recolector, vehículo y fecha." });
      return;
    }
    if (overCapacity) {
      setFeedback({ kind: "error", message: "La carga seleccionada supera la capacidad del vehículo." });
      return;
    }

    setWorking(true);
    try {
      const kilometers = await createRoute(data, selectedRequests, selectedVehicle, collectorId, date);
      setSelectedIds(new Set());
      setFeedback({
        kind: "success",
        message: `Ruta creada: ${selectedRequests.length} paradas, ${kgFormat.format(kilometers)} km estimados.`,
      });
      await refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo crear la ruta.",
      });
    } finally {
      setWorking(false);
    }
  }

  async function handleCancelRoute(route: Route) {
    if (!data) return;
    if (!window.confirm("¿Cancelar esta ruta? Sus solicitudes volverán a pendientes.")) return;

    setFeedback(null);
    setWorking(true);
    try {
      await cancelRoute(
        route.id,
        data.stops.filter((stop) => stop.ruta_id === route.id).map((stop) => stop.solicitud_id),
      );
      setFeedback({ kind: "success", message: "Ruta cancelada." });
      await refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo cancelar la ruta.",
      });
    } finally {
      setWorking(false);
    }
  }

  if (state.status === "loading") {
    return (
      <p className="staff-loading" role="status">
        <LoaderCircle className="spin" size={18} aria-hidden="true" />
        <span>Cargando panel…</span>
      </p>
    );
  }

  if (state.status === "error" || !data) {
    return (
      <div className="staff-stack">
        <p className="form-status form-status--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{state.status === "error" ? state.message : "No se pudo cargar el panel."}</span>
        </p>
        <button className="location-button" onClick={() => void refresh()} type="button">
          <RefreshCw size={15} aria-hidden="true" />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  const collectorNames = new Map(data.collectors.map((collector) => [collector.user_id, collector.nombre]));
  const vehicleNames = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle.nombre]));

  return (
    <div className="staff-stack staff-stack--wide">
      <section className="staff-section" aria-labelledby="requests-title">
        <div className="staff-section-heading">
          <div>
            <span className="eyebrow">Administración</span>
            <h1 id="requests-title">Solicitudes de recolección</h1>
          </div>
          <button
            className="location-button"
            disabled={working}
            onClick={() => void refresh()}
            type="button"
          >
            <RefreshCw size={15} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
        </div>

        <div className="staff-stats">
          {(Object.keys(counts) as Array<Request["estado"]>).map((estado) => (
            <div className="staff-stat" key={estado}>
              <strong>{counts[estado]}</strong>
              <span>{REQUEST_STATE_LABELS[estado]}</span>
            </div>
          ))}
        </div>

        <div className="staff-filters" role="group" aria-label="Filtrar solicitudes">
          {(Object.keys(FILTER_LABELS) as RequestFilter[]).map((option) => (
            <button
              aria-pressed={filter === option}
              className="staff-chip"
              key={option}
              onClick={() => setFilter(option)}
              type="button"
            >
              {FILTER_LABELS[option]}
            </button>
          ))}
        </div>

        {visibleRequests.length === 0 ? (
          <p className="staff-empty">No hay solicitudes en esta vista.</p>
        ) : (
          <ul className="request-list">
            {visibleRequests.map((request) => {
              const assignable = ASSIGNABLE_STATES.includes(request.estado);
              return (
                <li className="request-row" key={request.id}>
                  <input
                    aria-label={`Seleccionar ${request.direccion}`}
                    checked={selectedIds.has(request.id)}
                    className="request-check"
                    disabled={!assignable || working}
                    onChange={() => toggleRequest(request.id)}
                    type="checkbox"
                  />
                  <div className="stop-body">
                    <strong>{request.direccion}</strong>
                    <span>
                      {request.colonia} · {request.material} · {kgFormat.format(request.kg_estimados)} kg
                    </span>
                    <span className="stop-actions">
                      <span>{request.telefono}</span>
                      <a href={mapsUrl(request.latitud, request.longitud)} rel="noreferrer" target="_blank">
                        <MapPin size={14} aria-hidden="true" /> Mapa
                      </a>
                      <span>{formatTimestamp(request.created_at)}</span>
                    </span>
                  </div>
                  <span className={`staff-badge staff-badge--${request.estado}`}>
                    {REQUEST_STATE_LABELS[request.estado]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="staff-side">
        <form className="staff-card staff-assign" onSubmit={handleCreateRoute}>
          <h2>Crear ruta</h2>
          <p className="field-hint">
            {selectedRequests.length} solicitudes · {kgFormat.format(selectedKg)} kg
            {selectedVehicle ? ` de ${kgFormat.format(selectedVehicle.capacidad_kg)} kg` : ""}
          </p>
          {overCapacity ? (
            <p className="field-error">La carga supera la capacidad del vehículo.</p>
          ) : null}

          <label className="field">
            <span className="field-label">Recolector</span>
            <select
              className="field-input"
              onChange={(event) => setCollectorId(event.target.value)}
              value={collectorId}
            >
              <option value="">Selecciona…</option>
              {data.collectors.map((collector) => (
                <option key={collector.user_id} value={collector.user_id}>
                  {collector.nombre}
                </option>
              ))}
            </select>
            {data.collectors.length === 0 ? (
              <span className="field-hint">No hay recolectores registrados en perfiles.</span>
            ) : null}
          </label>

          <label className="field">
            <span className="field-label">Vehículo</span>
            <select
              className="field-input"
              onChange={(event) => setVehicleId(event.target.value)}
              value={vehicleId}
            >
              <option value="">Selecciona…</option>
              {data.vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.nombre} ({kgFormat.format(vehicle.capacidad_kg)} kg)
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Fecha</span>
            <input
              className="field-input"
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </label>

          <button className="submit-button" disabled={working} type="submit">
            {working ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <RouteIcon size={17} aria-hidden="true" />
            )}
            <span>{working ? "Guardando" : "Crear ruta optimizada"}</span>
          </button>

          {feedback ? (
            <p
              className={`form-status form-status--${feedback.kind}`}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.kind === "success" ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <AlertCircle size={18} aria-hidden="true" />
              )}
              <span>{feedback.message}</span>
            </p>
          ) : null}
        </form>

        <section className="staff-card" aria-labelledby="routes-title">
          <h2 id="routes-title">Rutas activas</h2>
          {data.routes.length === 0 ? (
            <p className="field-hint">Aún no hay rutas planeadas.</p>
          ) : (
            <ul className="route-list">
              {data.routes.map((route) => {
                const stopCount = data.stops.filter((stop) => stop.ruta_id === route.id).length;
                return (
                  <li className="route-row" key={route.id}>
                    <div className="stop-body">
                      <strong>
                        {formatRouteDate(route.fecha)} ·{" "}
                        {(route.recolector_id && collectorNames.get(route.recolector_id)) ?? "Sin recolector"}
                      </strong>
                      <span>
                        {vehicleNames.get(route.vehiculo_id) ?? "Vehículo"} · {stopCount} paradas ·{" "}
                        {kgFormat.format(route.kg_estimados)} kg · {kgFormat.format(route.kilometros_totales)} km
                      </span>
                      <span className="staff-card-meta">{ROUTE_STATE_LABELS[route.estado]}</span>
                    </div>
                    <button
                      aria-label="Cancelar ruta"
                      className="icon-button"
                      disabled={working}
                      onClick={() => void handleCancelRoute(route)}
                      title="Cancelar ruta"
                      type="button"
                    >
                      <XCircle size={17} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
