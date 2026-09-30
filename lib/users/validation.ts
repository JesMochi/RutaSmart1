export const STAFF_ROLES = ["administrador", "recolector"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export interface NewStaffUserInput {
  nombre: string;
  email: string;
  password: string;
  rol: StaffRole;
}

export type NewStaffUserErrors = Partial<Record<keyof NewStaffUserInput, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseNewStaffUserInput(value: unknown): {
  input: NewStaffUserInput | null;
  errors: NewStaffUserErrors;
} {
  if (!isRecord(value)) return { input: null, errors: { nombre: "Solicitud inválida." } };

  const errors: NewStaffUserErrors = {};
  const nombre = typeof value.nombre === "string" ? value.nombre.trim() : "";
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const password = typeof value.password === "string" ? value.password : "";
  const rol = value.rol;

  if (nombre.length < 2 || nombre.length > 80) {
    errors.nombre = "Escribe un nombre de 2 a 80 caracteres.";
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = "Escribe un correo válido.";
  }
  if (password.length < 8 || password.length > 72) {
    errors.password = "La contraseña debe tener de 8 a 72 caracteres.";
  }
  if (typeof rol !== "string" || !STAFF_ROLES.includes(rol as StaffRole)) {
    errors.rol = "Selecciona un rol válido.";
  }

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return { input: { nombre, email, password, rol: rol as StaffRole }, errors };
}
