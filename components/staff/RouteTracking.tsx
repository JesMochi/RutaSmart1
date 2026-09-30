"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Navigation, NavigationOff, Truck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatAgo, kgFormat } from "./format";

/** Cada cuánto se envía la ubicación como máximo, para no saturar la base. */
const LOCATION_INTERVAL_MS = 20_000;
const LOAD_LEVELS = [0, 25, 50, 75, 100] as const;

interface RouteTrackingProps {
  routeId: string;
  routeState: "planeada" | "en_curso" | "completada" | "cancelada";
  loadPercent: number | null;
  loadUpdatedAt: string | null;
  collectedKg: number;
  capacityKg: number;
  onChanged: () => void;
}

export function RouteTracking({
  routeId,
  routeState,
  loadPercent,
  loadUpdatedAt,
  collectedKg,
  capacityKg,
  onChanged,
}: RouteTrackingProps) {
  const [sharing, setSharing] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [locationError, setLocationError] = useState("");
  const [savingLoad, setSavingLoad] = useState(false);
  const [loadError, setLoadError] = useState("");
  const routeStateRef = useRef(routeState);
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    routeStateRef.current = routeState;
    onChangedRef.current = onChanged;
  }, [routeState, onChanged]);

  useEffect(() => {
    if (!sharing) return;
    if (!navigator.geolocation) {
      queueMicrotask(() => {
        setLocationError("Este dispositivo no permite compartir la ubicación.");
        setSharing(false);
      });
      return;
    }

    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now();
        if (now - lastSent < LOCATION_INTERVAL_MS) return;
        lastSent = now;

        void getSupabaseClient()
          .rpc("registrar_ubicacion_recolector", {
            p_ruta_id: routeId,
            p_latitud: coords.latitude,
            p_longitud: coords.longitude,
          })
          .then(({ error }) => {
            if (error) {
              setLocationError(
                error.code === "PGRST202"
                  ? "Falta aplicar la migración 006 en Supabase."
                  : "No se pudo enviar tu ubicación.",
              );
              return;
            }
            setLocationError("");
            setLastSentAt(new Date().toISOString());
            // La primera ubicación inicia la ruta: se recarga para ver tiempos estimados.
            if (routeStateRef.current === "planeada") onChangedRef.current();
          });
      },
      () => {
        setLocationError("Activa el permiso de ubicación para compartir tu recorrido.");
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [sharing, routeId]);

  async function saveLoad(percent: number) {
    setLoadError("");
    setSavingLoad(true);
    const { error } = await getSupabaseClient().rpc("registrar_carga_vehiculo", {
      p_ruta_id: routeId,
      p_porcentaje: percent,
    });
    setSavingLoad(false);
    if (error) {
      setLoadError(
        error.code === "PGRST202"
          ? "Falta aplicar la migración 006 en Supabase."
          : "No se pudo guardar la carga.",
      );
      return;
    }
    onChanged();
  }

  const collectedPercent = capacityKg > 0 ? Math.min(100, (collectedKg / capacityKg) * 100) : 0;

  return (
    <div className="route-tracking">
      <div className="route-tracking-row">
        <button
          className={sharing ? "location-button" : "submit-button stop-button"}
          onClick={() => {
            setLocationError("");
            setSharing((current) => !current);
          }}
          type="button"
        >
          {sharing ? (
            <NavigationOff size={15} aria-hidden="true" />
          ) : (
            <Navigation size={15} aria-hidden="true" />
          )}
          <span>
            {sharing
              ? "Dejar de compartir ubicación"
              : routeState === "planeada"
                ? "Iniciar ruta y compartir ubicación"
                : "Compartir ubicación"}
          </span>
        </button>
        <span className="staff-card-meta" role="status">
          {sharing
            ? lastSentAt
              ? `Ubicación enviada ${formatAgo(lastSentAt)}. Mantén esta página abierta.`
              : "Buscando tu ubicación…"
            : "Los vecinos reciben un aviso cuando estás cerca."}
        </span>
      </div>
      {locationError ? (
        <span className="field-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" /> {locationError}
        </span>
      ) : null}

      <div className="route-load">
        <span className="field-label">
          <Truck size={15} aria-hidden="true" /> ¿Qué tan lleno va el camión?
        </span>
        <div className="staff-filters" role="group" aria-label="Carga del vehículo">
          {LOAD_LEVELS.map((level) => (
            <button
              aria-pressed={loadPercent === level}
              className="staff-chip"
              disabled={savingLoad}
              key={level}
              onClick={() => void saveLoad(level)}
              type="button"
            >
              {level === 0 ? "Vacío" : level === 100 ? "Lleno" : `${level}%`}
            </button>
          ))}
        </div>
        <div
          aria-label="Carga según kilos registrados"
          className="load-bar"
          role="img"
        >
          <span style={{ width: `${collectedPercent}%` }} />
        </div>
        <span className="staff-card-meta">
          Kilos registrados: {kgFormat.format(collectedKg)} de {kgFormat.format(capacityKg)} kg (
          {Math.round(collectedPercent)}%)
          {loadPercent !== null && loadUpdatedAt
            ? ` · Tu reporte: ${loadPercent}% ${formatAgo(loadUpdatedAt)}`
            : ""}
        </span>
        {loadError ? (
          <span className="field-error" role="alert">
            {loadError}
          </span>
        ) : null}
      </div>
    </div>
  );
}
