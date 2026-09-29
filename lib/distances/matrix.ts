import "server-only";

import { calculateMissingDistanceEntries, type DistanceEntry, type DistanceNode } from "./osrm";
import {
  summarizeMatrixCoverage,
  type MatrixCoverage,
} from "./matrix-coverage";
import { getSupabaseAdminClient } from "../supabase/admin";

const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;
const ACTIVE_REQUEST_STATES = ["pendiente", "asignada", "sin_asignar"] as const;

interface MatrixSnapshot {
  nodes: DistanceNode[];
  existingEntries: DistanceEntry[];
  zoneIsDemo: boolean;
  adjustmentFactor: number;
  averageSpeedKmH: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function loadMatrixSnapshot(zoneId: string): Promise<MatrixSnapshot> {
  const supabase = getSupabaseAdminClient();
  const [zoneResult, parametersResult, requestsResult] = await Promise.all([
    supabase
      .from("zonas")
      .select("id, es_demo")
      .eq("id", zoneId)
      .single(),
    supabase
      .from("parametros")
      .select(
        "deposito_id, deposito_latitud, deposito_longitud, factor_ajuste_linea_recta, velocidad_respaldo_km_h",
      )
      .eq("zona_id", zoneId)
      .single(),
    supabase
      .from("solicitudes")
      .select("id, latitud, longitud, created_at")
      .eq("zona_id", zoneId)
      .in("estado", ACTIVE_REQUEST_STATES)
      .order("created_at")
      .order("id"),
  ]);

  if (zoneResult.error || !zoneResult.data) {
    throw new Error("No se encontró la zona configurada.");
  }
  if (parametersResult.error || !parametersResult.data) {
    throw new Error("La zona no tiene parámetros o depósito configurado.");
  }
  if (requestsResult.error || !requestsResult.data) {
    throw new Error("No se pudieron consultar las solicitudes activas.");
  }

  const nodes: DistanceNode[] = [
    {
      id: parametersResult.data.deposito_id,
      tipo: "deposito",
      latitude: parametersResult.data.deposito_latitud,
      longitude: parametersResult.data.deposito_longitud,
    },
    ...requestsResult.data.map((request) => ({
      id: request.id,
      tipo: "solicitud" as const,
      latitude: request.latitud,
      longitude: request.longitud,
    })),
  ];

  const existingEntries: DistanceEntry[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("matriz_distancias")
      .select(
        "origen_tipo, origen_id, destino_tipo, destino_id, metros, segundos, fuente",
      )
      .eq("zona_id", zoneId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data) throw new Error("No se pudo leer la matriz guardada.");
    existingEntries.push(...(data as DistanceEntry[]));
    if (data.length < PAGE_SIZE) break;
  }

  return {
    nodes,
    existingEntries,
    zoneIsDemo: zoneResult.data.es_demo,
    adjustmentFactor: parametersResult.data.factor_ajuste_linea_recta,
    averageSpeedKmH: parametersResult.data.velocidad_respaldo_km_h,
  };
}

export async function getDistanceMatrixCoverage(
  zoneId: string,
): Promise<MatrixCoverage> {
  const snapshot = await loadMatrixSnapshot(zoneId);
  return summarizeMatrixCoverage(snapshot.nodes, snapshot.existingEntries);
}

export async function ensureDistanceMatrix(
  zoneId: string,
): Promise<MatrixCoverage> {
  const supabase = getSupabaseAdminClient();
  const snapshot = await loadMatrixSnapshot(zoneId);
  const missingEntries = await calculateMissingDistanceEntries(
    snapshot.nodes,
    snapshot.existingEntries,
    {
      adjustmentFactor: snapshot.adjustmentFactor,
      averageSpeedKmH: snapshot.averageSpeedKmH,
      osrmBaseUrl: process.env.OSRM_BASE_URL,
    },
  );

  for (const batch of chunk(missingEntries, UPSERT_BATCH_SIZE)) {
    const rows = batch.map((entry) => ({
      ...entry,
      zona_id: zoneId,
      es_demo: snapshot.zoneIsDemo,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("matriz_distancias").upsert(rows, {
      onConflict:
        "zona_id,origen_tipo,origen_id,destino_tipo,destino_id",
    });

    if (error) throw new Error("No se pudo guardar la matriz de distancias.");
  }

  const updatedSnapshot = await loadMatrixSnapshot(zoneId);
  return summarizeMatrixCoverage(
    updatedSnapshot.nodes,
    updatedSnapshot.existingEntries,
  );
}