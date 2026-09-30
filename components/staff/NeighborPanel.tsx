"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { formatTimestamp, kgFormat, REQUEST_STATE_LABELS } from "./format";
import { NotificationToggle, TrackingDetails, useNeighborTracking } from "./NeighborTracking";

type Request = Pick<
  Database["public"]["Tables"]["solicitudes"]["Row"],
  | "id"
  | "direccion"
  | "colonia"
  | "material"
  | "kg_estimados"
  | "estado"
  | "created_at"
  | "kg_reales_pet"
  | "kg_reales_carton"
  | "kg_reales_aluminio"
  | "kg_reales_vidrio"
>;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; requests: Request[] };

// Los vecinos ven "Sin asignar" como pendiente: para ellos solo significa que aún no pasamos.
const NEIGHBOR_STATE_LABELS: Record<Request["estado"], string> = {
  ...REQUEST_STATE_LABELS,
  sin_asignar: "Por reprogramar",
};

async function loadOwnRequests(userId: string): Promise<Request[]> {
  const { data, error } = await getSupabaseClient()
    .from("solicitudes")
    .select(
      "id, direccion, colonia, material, kg_estimados, estado, created_at, kg_reales_pet, kg_reales_carton, kg_reales_aluminio, kg_reales_vidrio",
    )
    .eq("usuario_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) throw new Error("No se pudieron consultar tus solicitudes.");
  return data;
}

export function NeighborPanel({ userId }: { userId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    loadOwnRequests(userId).then(
      (requests) => {
        if (active) setState({ status: "ready", requests });
      },
      (error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "No se pudieron cargar tus solicitudes.",
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  const hasAssigned =
    state.status === "ready" && state.requests.some((request) => request.estado === "asignada");
  const tracking = useNeighborTracking(hasAssigned);

  // Mientras haya recolecciones en camino, refresca los estados para ver cuándo se cierran.
  useEffect(() => {
    if (!hasAssigned) return;
    const intervalId = window.setInterval(() => setReloadKey((key) => key + 1), 60_000);
    return () => window.clearInterval(intervalId);
  }, [hasAssigned]);

  const collectedKg =
    state.status === "ready"
      ? state.requests.reduce(
          (total, request) =>
            total +
            request.kg_reales_pet +
            request.kg_reales_carton +
            request.kg_reales_aluminio +
            request.kg_reales_vidrio,
          0,
        )
      : 0;

  return (
    <section className="staff-section" aria-labelledby="neighbor-title">
      <div className="staff-section-heading">
        <div>
          <span className="eyebrow">Mi cuenta</span>
          <h1 id="neighbor-title">Mis solicitudes</h1>
        </div>
        <div className="staff-user">
          {hasAssigned ? <NotificationToggle /> : null}
          <button
            className="location-button"
            disabled={state.status === "loading"}
            onClick={() => {
              setState({ status: "loading" });
              setReloadKey((key) => key + 1);
            }}
            type="button"
          >
            <RefreshCw size={15} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
          <Link className="header-cta" href="/#solicitud">
            <Plus size={15} aria-hidden="true" /> Nueva solicitud
          </Link>
        </div>
      </div>

      {state.status === "loading" ? (
        <p className="staff-loading" role="status">
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
          <span>Cargando solicitudes…</span>
        </p>
      ) : state.status === "error" ? (
        <p className="form-status form-status--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      ) : state.requests.length === 0 ? (
        <p className="staff-empty">
          Aún no tienes solicitudes. Las que envíes con tu sesión iniciada aparecerán aquí.
        </p>
      ) : (
        <>
          <div className="staff-stats">
            <div className="staff-stat">
              <strong>{state.requests.length}</strong>
              <span>Solicitudes enviadas</span>
            </div>
            <div className="staff-stat">
              <strong>{kgFormat.format(collectedKg)}</strong>
              <span>kg recolectados</span>
            </div>
          </div>
          <ul className="request-list">
            {state.requests.map((request) => (
              <li className="request-row" key={request.id}>
                <div className="stop-body">
                  <strong>{request.direccion}</strong>
                  <span>
                    {request.colonia} · {request.material} · {kgFormat.format(request.kg_estimados)} kg
                    estimados
                  </span>
                  <span>{formatTimestamp(request.created_at)}</span>
                  {request.estado === "recolectada" ? (
                    <span>
                      Recolectado:{" "}
                      {kgFormat.format(
                        request.kg_reales_pet +
                          request.kg_reales_carton +
                          request.kg_reales_aluminio +
                          request.kg_reales_vidrio,
                      )}{" "}
                      kg reales
                    </span>
                  ) : null}
                  {request.estado === "asignada" && tracking?.byRequest.get(request.id) ? (
                    <TrackingDetails
                      loadedAt={tracking.loadedAt}
                      tracking={tracking.byRequest.get(request.id)!}
                    />
                  ) : null}
                </div>
                <span className={`staff-badge staff-badge--${request.estado}`}>
                  {NEIGHBOR_STATE_LABELS[request.estado]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
