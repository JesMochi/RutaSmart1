"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  formatEta,
  formatRouteDate,
  kgFormat,
  mapsUrl,
  ROUTE_STATE_LABELS,
  STOP_STATE_LABELS,
} from "./format";
import { RouteTracking } from "./RouteTracking";
import { StopRegistration } from "./StopRegistration";

/** Recarga silenciosa para mantener al día los tiempos estimados. */
const REFRESH_INTERVAL_MS = 60_000;

type Tables = Database["public"]["Tables"];
type Route = Pick<
  Tables["rutas"]["Row"],
  | "id"
  | "fecha"
  | "estado"
  | "kg_estimados"
  | "capacidad_kg"
  | "porcentaje_carga"
  | "carga_actualizada_at"
>;
type Stop = Pick<Tables["paradas"]["Row"], "id" | "ruta_id" | "solicitud_id" | "secuencia" | "estado">;
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
  | "kg_reales_pet"
  | "kg_reales_carton"
  | "kg_reales_aluminio"
  | "kg_reales_vidrio"
>;

interface RouteWithStops extends Route {
  collectedKg: number;
  stops: Array<Stop & { request: Request | undefined; etaMinutes: number | undefined }>;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; routes: RouteWithStops[]; loadedAt: number };

function realKg(request: Request): number {
  return (
    request.kg_reales_pet +
    request.kg_reales_carton +
    request.kg_reales_aluminio +
    request.kg_reales_vidrio
  );
}

async function loadRouteEtas(routeId: string): Promise<Map<string, number>> {
  const { data, error } = await getSupabaseClient().rpc("tiempos_ruta", { p_ruta_id: routeId });
  // Sin la migración 006 la ruta se muestra igual, solo sin tiempos estimados.
  if (error || !data) return new Map();
  return new Map(data.map((row) => [row.parada_id, row.minutos_llegada]));
}

async function loadCollectorRoutes(userId: string): Promise<RouteWithStops[]> {
  const supabase = getSupabaseClient();
  const { data: routes, error: routesError } = await supabase
    .from("rutas")
    .select("id, fecha, estado, kg_estimados, capacidad_kg, porcentaje_carga, carga_actualizada_at")
    .eq("recolector_id", userId)
    .in("estado", ["planeada", "en_curso"])
    .order("fecha")
    .order("created_at");
  if (routesError || !routes) throw new Error("No se pudieron consultar tus rutas.");
  if (routes.length === 0) return [];

  const { data: stops, error: stopsError } = await supabase
    .from("paradas")
    .select("id, ruta_id, solicitud_id, secuencia, estado")
    .in("ruta_id", routes.map((route) => route.id))
    .order("secuencia");
  if (stopsError || !stops) throw new Error("No se pudieron consultar las paradas.");

  const requestIds = [...new Set(stops.map((stop) => stop.solicitud_id))];
  const [requestsResult, etasByRoute] = await Promise.all([
    requestIds.length
      ? supabase
          .from("solicitudes")
          .select(
            "id, colonia, direccion, latitud, longitud, material, kg_estimados, telefono, kg_reales_pet, kg_reales_carton, kg_reales_aluminio, kg_reales_vidrio",
          )
          .in("id", requestIds)
      : Promise.resolve({ data: [] as Request[], error: null }),
    Promise.all(
      routes.map(async (route) =>
        [route.id, route.estado === "en_curso" ? await loadRouteEtas(route.id) : new Map()] as const,
      ),
    ),
  ]);
  if (requestsResult.error || !requestsResult.data) {
    throw new Error("No se pudieron consultar las solicitudes.");
  }

  const requestsById = new Map(requestsResult.data.map((request) => [request.id, request]));
  const etas = new Map<string, Map<string, number>>(etasByRoute);

  return routes.map((route) => {
    const routeStops = stops
      .filter((stop) => stop.ruta_id === route.id)
      .map((stop) => ({
        ...stop,
        request: requestsById.get(stop.solicitud_id),
        etaMinutes: etas.get(route.id)?.get(stop.id),
      }));
    return {
      ...route,
      collectedKg: routeStops.reduce(
        (total, stop) => total + (stop.request ? realKg(stop.request) : 0),
        0,
      ),
      stops: routeStops,
    };
  });
}

export function CollectorPanel({ userId }: { userId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    loadCollectorRoutes(userId).then(
      (routes) => {
        if (active) setState({ status: "ready", routes, loadedAt: Date.now() });
      },
      (error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "No se pudieron cargar tus rutas.",
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setReloadKey((key) => key + 1), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  function handleRegistered(routeCompleted: boolean) {
    setNotice(routeCompleted ? "¡Ruta completada! Gracias por tu recorrido." : "");
    reload();
  }

  return (
    <section className="staff-section" aria-labelledby="collector-title">
      <div className="staff-section-heading">
        <div>
          <span className="eyebrow">Recolección</span>
          <h1 id="collector-title">Mis rutas</h1>
        </div>
        <button
          className="location-button"
          disabled={state.status === "loading"}
          onClick={() => {
            setNotice("");
            setState({ status: "loading" });
            reload();
          }}
          type="button"
        >
          <RefreshCw size={15} aria-hidden="true" />
          <span>Actualizar</span>
        </button>
      </div>

      {state.status === "loading" ? (
        <p className="staff-loading" role="status">
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
          <span>Cargando rutas…</span>
        </p>
      ) : state.status === "error" ? (
        <p className="form-status form-status--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      ) : null}

      {notice ? (
        <p className="form-status form-status--success" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{notice}</span>
        </p>
      ) : null}

      {state.status !== "ready" ? null : state.routes.length === 0 ? (
        <p className="staff-empty">No tienes rutas asignadas por ahora.</p>
      ) : (
        <div className="staff-stack">
          {state.routes.map((route) => (
            <article className="staff-card" key={route.id}>
              <header className="staff-card-header">
                <h2>{formatRouteDate(route.fecha)}</h2>
                <span className="staff-badge">{ROUTE_STATE_LABELS[route.estado]}</span>
                <span className="staff-card-meta">
                  {route.stops.length} paradas · {kgFormat.format(route.kg_estimados)} kg estimados
                </span>
              </header>

              <RouteTracking
                capacityKg={route.capacidad_kg}
                collectedKg={route.collectedKg}
                loadPercent={route.porcentaje_carga}
                loadUpdatedAt={route.carga_actualizada_at}
                onChanged={reload}
                routeId={route.id}
                routeState={route.estado}
              />

              <ol className="stop-list">
                {route.stops.map((stop) => (
                  <li className="stop-item" key={stop.id}>
                    <span className="stop-number">{stop.secuencia}</span>
                    {stop.request ? (
                      <div className="stop-body">
                        <strong>{stop.request.direccion}</strong>
                        <span>
                          {stop.request.colonia} · {stop.request.material} ·{" "}
                          {kgFormat.format(stop.request.kg_estimados)} kg estimados
                        </span>
                        {stop.estado === "pendiente" && stop.etaMinutes !== undefined ? (
                          <span className="stop-eta">
                            <Clock size={13} aria-hidden="true" /> Llegada estimada en{" "}
                            {formatEta(stop.etaMinutes, state.loadedAt)}
                          </span>
                        ) : null}
                        {stop.estado === "recolectada" ? (
                          <span>Recolectado: {kgFormat.format(realKg(stop.request))} kg reales</span>
                        ) : null}
                        <span className="stop-actions">
                          <a href={`tel:${stop.request.telefono.replace(/[^0-9+]/g, "")}`}>
                            <Phone size={14} aria-hidden="true" /> {stop.request.telefono}
                          </a>
                          <a
                            href={mapsUrl(stop.request.latitud, stop.request.longitud)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <MapPin size={14} aria-hidden="true" /> Abrir en mapa
                          </a>
                        </span>
                        {stop.estado === "pendiente" ? (
                          <StopRegistration
                            estimatedKg={stop.request.kg_estimados}
                            onRegistered={handleRegistered}
                            requestedMaterial={stop.request.material}
                            stopId={stop.id}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <div className="stop-body">
                        <span>Solicitud no disponible.</span>
                      </div>
                    )}
                    {stop.estado !== "pendiente" ? (
                      <span className={`staff-badge staff-badge--${stop.estado}`}>
                        {STOP_STATE_LABELS[stop.estado]}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
