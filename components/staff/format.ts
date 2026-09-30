export const kgFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const dateTimeFormat = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Formatea una columna `date` (AAAA-MM-DD) sin desplazarla por zona horaria. */
export function formatRouteDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

export function formatTimestamp(timestamp: string): string {
  return dateTimeFormat.format(new Date(timestamp));
}

/** Fecha local de hoy en formato AAAA-MM-DD para inputs `date`. */
export function todayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

const clockFormat = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

/** "12 min (≈ 10:45)" a partir de los minutos estimados desde ahora. */
export function formatEta(minutes: number, now = Date.now()): string {
  const rounded = Math.max(1, Math.round(minutes));
  const arrival = clockFormat.format(new Date(now + rounded * 60_000));
  return rounded >= 60
    ? `${Math.floor(rounded / 60)} h ${rounded % 60} min (≈ ${arrival})`
    : `${rounded} min (≈ ${arrival})`;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${kgFormat.format(meters / 1000)} km`;
}

/** "hace 3 min" para marcas de tiempo recientes. */
export function formatAgo(timestamp: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(timestamp).getTime()) / 60_000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export const REQUEST_STATE_LABELS = {
  pendiente: "Pendiente",
  asignada: "Asignada",
  recolectada: "Recolectada",
  sin_asignar: "Sin asignar",
} as const;

export const STOP_STATE_LABELS = {
  pendiente: "Pendiente",
  recolectada: "Recolectada",
  sin_recolectar: "No recolectada",
} as const;

export const ROUTE_STATE_LABELS = {
  planeada: "Planeada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
} as const;
