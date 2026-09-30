"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Clock, Truck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { formatAgo, formatDistance, formatEta, formatRouteDate } from "./format";

export type RequestTracking =
  Database["public"]["Functions"]["seguimiento_mis_solicitudes"]["Returns"][number];

/** Distancia a la que se avisa que el recolector está cerca. */
export const NEARBY_METERS = 1000;
const POLL_INTERVAL_MS = 30_000;

export function isCollectorNearby(tracking: RequestTracking): boolean {
  if (tracking.ruta_estado !== "en_curso") return false;
  return (
    tracking.paradas_antes === 0 ||
    (tracking.metros_recolector !== null && tracking.metros_recolector <= NEARBY_METERS)
  );
}

type TrackingState = { byRequest: Map<string, RequestTracking>; loadedAt: number } | null;

/**
 * Consulta cada 30 segundos el seguimiento de las solicitudes asignadas del vecino y
 * dispara una notificación del navegador la primera vez que el recolector está cerca.
 */
export function useNeighborTracking(enabled: boolean): TrackingState {
  const [tracking, setTracking] = useState<TrackingState>(null);
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function poll() {
      const { data, error } = await getSupabaseClient().rpc("seguimiento_mis_solicitudes");
      if (!active || error || !data) return;

      for (const row of data) {
        if (isCollectorNearby(row) && !notifiedRef.current.has(row.solicitud_id)) {
          notifiedRef.current.add(row.solicitud_id);
          notifyNearby(row);
        }
      }
      setTracking({
        byRequest: new Map(data.map((row) => [row.solicitud_id, row])),
        loadedAt: Date.now(),
      });
    }

    void poll();
    const intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  return tracking;
}

function notifyNearby(tracking: RequestTracking) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const body =
    tracking.paradas_antes === 0
      ? "Tu parada es la siguiente. Ten listo tu material."
      : `El recolector está a ${formatDistance(tracking.metros_recolector ?? 0)} de tu domicilio.`;
  try {
    new Notification("RutaSmart: el recolector está cerca", { body, tag: tracking.solicitud_id });
  } catch {
    // Algunos navegadores móviles solo permiten notificaciones desde un service worker.
  }
  navigator.vibrate?.([200, 100, 200]);
}

export function NotificationToggle() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  if (permission === "unsupported" || permission === "granted") return null;

  return (
    <button
      className="location-button"
      disabled={permission === "denied"}
      onClick={() => void Notification.requestPermission().then(setPermission)}
      title={permission === "denied" ? "Permite las notificaciones en la configuración del navegador." : undefined}
      type="button"
    >
      <BellRing size={15} aria-hidden="true" />
      <span>{permission === "denied" ? "Alertas bloqueadas" : "Activar alertas"}</span>
    </button>
  );
}

export function TrackingDetails({
  tracking,
  loadedAt,
}: {
  tracking: RequestTracking;
  loadedAt: number;
}) {
  if (tracking.ruta_estado === "planeada") {
    return (
      <span className="stop-eta">
        <Truck size={13} aria-hidden="true" /> Recolección programada para el{" "}
        {formatRouteDate(tracking.fecha)}. Te avisaremos cuando el recolector salga.
      </span>
    );
  }

  const nearby = isCollectorNearby(tracking);
  return (
    <>
      {nearby ? (
        <span className="nearby-alert" role="alert">
          <BellRing size={15} aria-hidden="true" />
          {tracking.paradas_antes === 0
            ? "¡Tu parada es la siguiente! Ten listo tu material."
            : "¡El recolector está cerca! Ten listo tu material."}
        </span>
      ) : null}
      <span className="stop-eta">
        <Clock size={13} aria-hidden="true" />
        {tracking.minutos_llegada !== null
          ? `Llegada estimada en ${formatEta(tracking.minutos_llegada, loadedAt)}`
          : "El recolector ya está en ruta."}
      </span>
      <span>
        {tracking.paradas_antes === 0
          ? "Eres la siguiente parada"
          : `Faltan ${tracking.paradas_antes} ${tracking.paradas_antes === 1 ? "parada" : "paradas"} antes de la tuya`}
        {tracking.metros_recolector !== null
          ? ` · recolector a ${formatDistance(tracking.metros_recolector)}`
          : ""}
        {tracking.ubicacion_actualizada_at
          ? ` · ubicación ${formatAgo(tracking.ubicacion_actualizada_at, loadedAt)}`
          : ""}
      </span>
    </>
  );
}
