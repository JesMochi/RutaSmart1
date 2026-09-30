import assert from "node:assert/strict";
import test from "node:test";
import { parseNewStaffUserInput, PUBLIC_SIGNUP_ROLES } from "./validation";

const validUser = {
  nombre: "Ana Recolectora",
  email: "Ana@Ejemplo.com ",
  password: "segura123",
  rol: "recolector",
};

test("acepta un usuario válido y normaliza el correo", () => {
  const result = parseNewStaffUserInput(validUser);

  assert.equal(result.input?.email, "ana@ejemplo.com");
  assert.equal(result.input?.rol, "recolector");
});

test("rechaza correo, contraseña corta y roles desconocidos", () => {
  const result = parseNewStaffUserInput({
    ...validUser,
    email: "sin-arroba",
    password: "corta",
    rol: "superusuario",
  });

  assert.equal(result.input, null);
  assert.ok(result.errors.email);
  assert.ok(result.errors.password);
  assert.ok(result.errors.rol);
});

test("el registro público no permite elegir administrador", () => {
  const admin = parseNewStaffUserInput({ ...validUser, rol: "administrador" }, PUBLIC_SIGNUP_ROLES);
  const vecino = parseNewStaffUserInput({ ...validUser, rol: "vecino" }, PUBLIC_SIGNUP_ROLES);

  assert.equal(admin.input, null);
  assert.ok(admin.errors.rol);
  assert.equal(vecino.input?.rol, "vecino");
});

test("rechaza payloads que no sean objetos", () => {
  assert.equal(parseNewStaffUserInput(null).input, null);
  assert.equal(parseNewStaffUserInput(["x"]).input, null);
});
