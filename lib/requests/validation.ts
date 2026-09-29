export const RECYCLABLE_MATERIALS = ["PET", "Cartón", "Aluminio", "Vidrio"] as const;

export type RecyclableMaterial = (typeof RECYCLABLE_MATERIALS)[number];

export interface PublicRequestInput {
  zonaId: string;
  colonia: string;
  direccion: string;
  latitud: number;
  longitud: number;
  material: RecyclableMaterial;
  kgEstimados: number;
  telefono: string;
  honeypot: string;
}

export type PublicRequestErrors = Partial<
  Record<keyof PublicRequestInput, string>
>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePublicRequestInput(value: unknown): {
  input: PublicRequestInput | null;
  errors: PublicRequestErrors;
} {
  const errors: PublicRequestErrors = {};
  if (!isRecord(value)) {
    return { input: null, errors: { colonia: "Solicitud inválida." } };
  }

  const zonaId = typeof value.zonaId === "string" ? value.zonaId.trim() : "";
  const colonia = typeof value.colonia === "string" ? value.colonia.trim() : "";
  const direccion = typeof value.direccion === "string" ? value.direccion.trim() : "";
  const telefono = typeof value.telefono === "string" ? value.telefono.trim() : "";
  const material = value.material;
  const latitud = value.latitud;
  const longitud = value.longitud;
  const kgEstimados = value.kgEstimados;
  const honeypot = typeof value.honeypot === "string" ? value.honeypot.trim() : "";

  if (typeof value.honeypot !== "string") {
    errors.honeypot = "Solicitud inválida.";
  }
  if (!UUID_PATTERN.test(zonaId)) errors.zonaId = "Zona inválida.";
  if (colonia.length < 2 || colonia.length > 120) {
    errors.colonia = "Escribe una colonia de 2 a 120 caracteres.";
  }
  if (direccion.length < 5 || direccion.length > 240) {
    errors.direccion = "Escribe una dirección de 5 a 240 caracteres.";
  }
  if (
    typeof latitud !== "number" ||
    !Number.isFinite(latitud) ||
    latitud < -90 ||
    latitud > 90
  ) {
    errors.latitud = "Marca una ubicación válida en el mapa.";
  }
  if (
    typeof longitud !== "number" ||
    !Number.isFinite(longitud) ||
    longitud < -180 ||
    longitud > 180
  ) {
    errors.longitud = "Marca una ubicación válida en el mapa.";
  }
  if (
    typeof material !== "string" ||
    !RECYCLABLE_MATERIALS.includes(material as RecyclableMaterial)
  ) {
    errors.material = "Selecciona un material aceptado.";
  }
  if (
    typeof kgEstimados !== "number" ||
    !Number.isFinite(kgEstimados) ||
    kgEstimados <= 0 ||
    kgEstimados > 10000
  ) {
    errors.kgEstimados = "Indica una cantidad mayor a 0 y no mayor a 10,000 kg.";
  }
  if (!/^\+?[0-9() -]{10,20}$/.test(telefono)) {
    errors.telefono = "Escribe un teléfono válido de 10 a 20 caracteres.";
  }
  if (honeypot.length > 200) errors.honeypot = "Solicitud inválida.";

  if (Object.keys(errors).length > 0) return { input: null, errors };

  return {
    input: {
      zonaId,
      colonia,
      direccion,
      latitud: latitud as number,
      longitud: longitud as number,
      material: material as RecyclableMaterial,
      kgEstimados: kgEstimados as number,
      telefono,
      honeypot,
    },
    errors,
  };
}