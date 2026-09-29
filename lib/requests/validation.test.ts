import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicRequestInput } from "./validation";

const validRequest = {
  zonaId: "00000000-0000-4000-8000-000000000001",
  colonia: "Jardines de Morelos",
  direccion: "Calle Robles 14",
  latitud: 19.601,
  longitud: -99.032,
  material: "PET",
  kgEstimados: 4.5,
  telefono: "5512345678",
  honeypot: "",
};

test("acepta una solicitud válida y normaliza espacios de texto", () => {
  const result = parsePublicRequestInput({
    ...validRequest,
    colonia: "  Jardines de Morelos  ",
    telefono: " 5512345678 ",
  });

  assert.equal(result.errors.zonaId, undefined);
  assert.equal(result.input?.colonia, "Jardines de Morelos");
  assert.equal(result.input?.telefono, "5512345678");
});

test("rechaza materiales no permitidos, kilos inválidos y coordenadas fuera de rango", () => {
  const result = parsePublicRequestInput({
    ...validRequest,
    material: "Orgánico",
    kgEstimados: 0,
    latitud: 91,
    longitud: 181,
  });

  assert.equal(result.input, null);
  assert.ok(result.errors.material);
  assert.ok(result.errors.kgEstimados);
  assert.ok(result.errors.latitud);
  assert.ok(result.errors.longitud);
});

test("rechaza payloads que no sean objetos", () => {
  assert.equal(parsePublicRequestInput(null).input, null);
  assert.ok(parsePublicRequestInput([]).errors.colonia);
});

test("exige honeypot vacío explícitamente en cada solicitud", () => {
  const withoutHoneypot: Record<string, unknown> = { ...validRequest };
  delete withoutHoneypot.honeypot;

  assert.equal(parsePublicRequestInput(withoutHoneypot).input, null);
  assert.ok(parsePublicRequestInput(withoutHoneypot).errors.honeypot);
});