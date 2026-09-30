"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  formatRouteDate,
  kgFormat,
  mapsUrl,
  ROUTE_STATE_LABELS,
  STOP_STATE_LABELS,
} from "./format";

type Tables = Database["public"]["Tables"];
type Route = Pick<Tables["rutas"]["Row"], "id" | "fecha" | "estado" | "kg_estimados" | "capacidad_kg">;
type Stop = Pick<Tables["paradas"]["Row"], "id" | "ruta_id" | "solicitud_id" | "secuencia" | "estado">;
type Request = Pick<
  Tables["solicitudes"]["Row"],
  "id" | "colonia" | "direccion" | "latitud" | "longitud" | "material" | "kg_estimados" | "telefono"
>;

interface RouteWithStops extends Route {
  stops: Array<Stop & { request: Request | undefined }>;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; routes: RouteWithStops[] };

interface StopRegistrationProps {
  stopId: string;
  estimatedKg: number;
  onRegistered: (routeCompleted: boolean) => void;
}

function StopRegistration({ stopId, estimatedKg, onRegistered }: StopRegistrationProps) {
  const [kilograms, setKilograms] = useState(String(estimatedKg));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function register(collected: boolean) {
    setError("");
    const kg = Number(kilograms);
    if (collected && (!Number.isFinite(kg) || kg <= 0 || kg > 10000)) {
      setError("Indica kilos mayores a 0 y hasta 10,000.");
      return;
    }
    if (!collected && !window.confirm("¿Marcar esta parada como no recolectada?")) return;

    setSending(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc("registrar_recoleccion", {
      p_parada_id: stopId,
      p_recolectada: collected,
      p_kg_reales: collected ? kg : null,
    });
    setSending(false);

    if (rpcError || !data) {
      setError(
        rpcError?.code === "PGRST202"
          ? "Falta aplicar la migración 003 en Supabase."
          : (rpcError?.message ?? "No se pudo registrar la parada."),
      );
      return;
    }
    onRegistered(data.ruta_completada);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void register(true);
  }

  return (
    <form className="stop-register" onSubmit={handleSubmit}>
      <label className="input-with-unit stop-kg">
        <input
          aria-label="Kilos reales recolectados"
          className="field-input"
          disabled={sending}
          inputMode="decimal"
          max="10000"
          min="0.1"
          onChange={(event) => setKilograms(event.target.value)}
          step="0.1"
          type="number"
          value={kilograms}
        />
        <span>kg</span>
      </label>
      <button className="submit-button stop-button" disabled={sending} type="submit">
        {sending ? (
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
        ) : (
          <Check size={16} aria-hidden="true" />
        )}
        <span>Recolectada</span>
      </button>
      <button
        className="location-button stop-button"
        disabled={sending}
        onClick={() => void register(false)}
        type="button"
      >
        <X size={15} aria-hidden="true" />
        <span>No se pudo</span>
      </button>
      {error ? (
        <span className="field-error stop-register-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}

async function loadCollectorRoutes(userId: string): Promise<RouteWithStops[]> {
  const supabase = getSupabaseClient();
  const { data: routes, error: routesError } = await supabase
    .from("rutas")
    .select("id, fecha, estado, kg_estimados, capacidad_kg")
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
  const { data: requests, error: requestsError } = requestIds.length
    ? await supabase
        .from("solicitudes")
        .select("id, colonia, direccion, latitud, longitud, material, kg_estimados, telefono")
        .in("id", requestIds)
    : { data: [] as Request[], error: null };
  if (requestsError || !requests) throw new Error("No se pudieron consultar las solicitudes.");

  const requestsById = new Map(requests.map((request) => [request.id, request]));
  return routes.map((route) => ({
    ...route,
    stops: stops
      .filter((stop) => stop.ruta_id === route.id)
      .map((stop) => ({ ...stop, request: requestsById.get(stop.solicitud_id) })),
  }));
}

export function CollectorPanel({ userId }: { userId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    loadCollectorRoutes(userId).then(
      (routes) => {
        if (active) setState({ status: "ready", routes });
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

  function handleRegistered(routeCompleted: boolean) {
    setNotice(routeCompleted ? "¡Ruta completada! Gracias por tu recorrido." : "");
    setReloadKey((key) => key + 1);
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
            setReloadKey((key) => key + 1);
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
                  {route.stops.length} paradas · {kgFormat.format(route.kg_estimados)} de{" "}
                  {kgFormat.format(route.capacidad_kg)} kg
                </span>
              </header>
              <ol className="stop-list">
                {route.stops.map((stop) => (
                  <li className="stop-item" key={stop.id}>
                    <span className="stop-number">{stop.secuencia}</span>
                    {stop.request ? (
                      <div className="stop-body">
                        <strong>{stop.request.direccion}</strong>
                        <span>
                          {stop.request.colonia} · {stop.request.material} ·{" "}
                          {kgFormat.format(stop.request.kg_estimados)} kg
                        </span>
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
