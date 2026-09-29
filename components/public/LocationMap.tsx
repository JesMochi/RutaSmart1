"use client";

import { useEffect } from "react";
import {
  Circle,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression, LeafletMouseEvent } from "leaflet";

export interface MapLocation {
  latitude: number;
  longitude: number;
}

const DEFAULT_CENTER: LatLngExpression = [19.601, -99.032];

interface LocationMapProps {
  location: MapLocation | null;
  onSelect: (location: MapLocation) => void;
}

function MapClickHandler({ onSelect }: Pick<LocationMapProps, "onSelect">) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      onSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

function RecenterMap({ location }: Pick<LocationMapProps, "location">) {
  const map = useMap();

  useEffect(() => {
    if (location) map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 15));
  }, [location, map]);

  return null;
}

export default function LocationMap({ location, onSelect }: LocationMapProps) {
  const markerPosition: LatLngExpression | null = location
    ? [location.latitude, location.longitude]
    : null;

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={14}
      scrollWheelZoom
      className="location-map"
      aria-label="Mapa para seleccionar el punto de recolección"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onSelect={onSelect} />
      <RecenterMap location={location} />
      {markerPosition ? (
        <Circle
          center={markerPosition}
          radius={12}
          pathOptions={{ color: "#154f3b", fillColor: "#b6dc56", fillOpacity: 0.9 }}
        />
      ) : null}
    </MapContainer>
  );
}