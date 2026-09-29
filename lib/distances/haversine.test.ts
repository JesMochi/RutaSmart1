import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackDurationSeconds,
  haversineDistanceMeters,
} from "./haversine";

const ecatepec = { latitude: 19.601, longitude: -99.032 };

test("la distancia de un punto a sí mismo es cero", () => {
  assert.equal(haversineDistanceMeters(ecatepec, ecatepec), 0);
});

test("la distancia es simétrica y el factor ajusta el resultado", () => {
  const destination = { latitude: 19.61, longitude: -99.02 };
  const forward = haversineDistanceMeters(ecatepec, destination, 1);
  const reverse = haversineDistanceMeters(destination, ecatepec, 1);

  assert.equal(forward, reverse);
  assert.equal(
    haversineDistanceMeters(ecatepec, destination, 1.3),
    Math.round(forward * 1.3),
  );
});

test("la duración de respaldo usa la velocidad promedio configurada", () => {
  assert.equal(fallbackDurationSeconds(25_000, 25), 3600);
});

test("rechaza coordenadas y parámetros fuera de rango", () => {
  assert.throws(
    () => haversineDistanceMeters({ latitude: 91, longitude: 0 }, ecatepec),
    RangeError,
  );
  assert.throws(() => haversineDistanceMeters(ecatepec, ecatepec, 0.9), RangeError);
  assert.throws(() => fallbackDurationSeconds(100, 0), RangeError);
});