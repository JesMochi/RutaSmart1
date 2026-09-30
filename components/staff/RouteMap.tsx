"use client";

import { useEffect, useMemo, useState } from "react";
import L, { type LatLngTuple } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

export interface RouteMapStop {
  id: string;
  sequence: number;
  latitude: number;
  longitude: number;
  label: string;
  done: boolean;
}

interface RouteMapProps {
  stops: RouteMapStop[];
  collectorPosition: LatLngTuple | null;
}

const OSRM_URL = "https://router.project-osrm.org";
const ROUTE_COLOR = "#2f9e44";

/**
 * Trazo por calles reales con OSRM. Si el servicio falla, se usa la línea recta entre
 * paradas para que la ruta siempre se vea.
 */
async function fetchRoadGeometry(points: LatLngTuple[], signal: AbortSignal): Promise<LatLngTuple[]> {
  if (points.length < 2) return points;
  try {
    const coordinates = points.map(([lat, lon]) => `${lon},${lat}`).join(";");
    const response = await fetch(
      `${OSRM_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
      { signal },
    );
    if (!response.ok) return points;
    const body = (await response.json()) as {
      code: string;
      routes?: Array<{ geometry: { coordinates: Array<[number, number]> } }>;
    };
    const geometry = body.routes?.[0]?.geometry.coordinates;
    if (body.code !== "Ok" || !geometry?.length) return points;
    return geometry.map(([lon, lat]) => [lat, lon]);
  } catch {
    return points;
  }
}

function useRoadGeometry(points: LatLngTuple[]): LatLngTuple[] {
  const key = JSON.stringify(points);
  const [geometry, setGeometry] = useState<{ key: string; line: LatLngTuple[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const requested = JSON.parse(key) as LatLngTuple[];
    void fetchRoadGeometry(requested, controller.signal).then((line) => {
      if (!controller.signal.aborted) setGeometry({ key, line });
    });
    return () => controller.abort();
  }, [key]);

  // Mientras llega el trazo por calles, se muestra la línea recta.
  return geometry?.key === key ? geometry.line : points;
}

function stopIcon(stop: RouteMapStop, isNext: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="route-stop-icon${stop.done ? " route-stop-icon--done" : ""}${
      isNext ? " route-stop-icon--next" : ""
    }">${stop.sequence}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function FitToRoute({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  const key = JSON.stringify(points);

  useEffect(() => {
    const bounds = JSON.parse(key) as LatLngTuple[];
    if (bounds.length === 0) return;
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
  }, [key, map]);

  return null;
}

export default function RouteMap({ stops, collectorPosition }: RouteMapProps) {
  const ordered = useMemo(() => [...stops].sort((a, b) => a.sequence - b.sequence), [stops]);
  const nextStop = ordered.find((stop) => !stop.done);

  const routePoints = useMemo<LatLngTuple[]>(
    () => ordered.map((stop) => [stop.latitude, stop.longitude]),
    [ordered],
  );
  const approachPoints = useMemo<LatLngTuple[]>(
    () =>
      collectorPosition && nextStop
        ? [collectorPosition, [nextStop.latitude, nextStop.longitude]]
        : [],
    [collectorPosition, nextStop],
  );

  const routeLine = useRoadGeometry(routePoints);
  const approachLine = useRoadGeometry(approachPoints);

  const boundsPoints = useMemo<LatLngTuple[]>(
    () => (collectorPosition ? [...routePoints, collectorPosition] : routePoints),
    [routePoints, collectorPosition],
  );

  return (
    <MapContainer
      center={routePoints[0] ?? [19.601, -99.032]}
      zoom={15}
      scrollWheelZoom={false}
      className="route-map"
      aria-label="Mapa de la ruta"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToRoute points={boundsPoints} />

      {routeLine.length > 1 ? (
        <Polyline
          positions={routeLine}
          pathOptions={{ color: ROUTE_COLOR, weight: 5, opacity: 0.85, lineJoin: "round" }}
        />
      ) : null}
      {approachLine.length > 1 ? (
        <Polyline
          positions={approachLine}
          pathOptions={{ color: ROUTE_COLOR, weight: 4, opacity: 0.9, dashArray: "8 8" }}
        />
      ) : null}

      {ordered.map((stop) => (
        <Marker
          icon={stopIcon(stop, stop.id === nextStop?.id)}
          key={stop.id}
          position={[stop.latitude, stop.longitude]}
        >
          <Tooltip direction="top" offset={[0, -12]}>
            {stop.sequence}. {stop.label}
            {stop.done ? " (cerrada)" : ""}
          </Tooltip>
        </Marker>
      ))}

      {collectorPosition ? (
        <CircleMarker
          center={collectorPosition}
          radius={8}
          pathOptions={{ color: "white", weight: 3, fillColor: "#1c7ed6", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            Tu ubicación
          </Tooltip>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}
