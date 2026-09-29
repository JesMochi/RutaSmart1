export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function validateCoordinates({ latitude, longitude }: Coordinates): void {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError("Las coordenadas deben ser latitudes y longitudes válidas.");
  }
}

export function haversineDistanceMeters(
  origin: Coordinates,
  destination: Coordinates,
  adjustmentFactor = 1.3,
): number {
  validateCoordinates(origin);
  validateCoordinates(destination);

  if (!Number.isFinite(adjustmentFactor) || adjustmentFactor < 1) {
    throw new RangeError("El factor de ajuste debe ser un número igual o mayor que 1.");
  }

  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return Math.round(EARTH_RADIUS_METERS * centralAngle * adjustmentFactor);
}

export function fallbackDurationSeconds(
  distanceMeters: number,
  averageSpeedKmH: number,
): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new RangeError("La distancia debe ser un número no negativo.");
  }

  if (!Number.isFinite(averageSpeedKmH) || averageSpeedKmH <= 0) {
    throw new RangeError("La velocidad promedio debe ser mayor que cero.");
  }

  return Math.round((distanceMeters / 1000 / averageSpeedKmH) * 3600);
}