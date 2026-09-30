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
