import {
  fallbackDurationSeconds,
  haversineDistanceMeters,
  type Coordinates,
} from "./haversine";

export type DistanceNodeType = "deposito" | "solicitud";
export type DistanceSource = "osrm" | "haversine";

export interface DistanceNode extends Coordinates {
  id: string;
  tipo: DistanceNodeType;
}

export interface DistanceEntry {
  origen_tipo: DistanceNodeType;
  origen_id: string;
  destino_tipo: DistanceNodeType;
  destino_id: string;
  metros: number;
  segundos: number;
  fuente: DistanceSource;
}

export interface RoutingOptions {
  adjustmentFactor: number;
  averageSpeedKmH: number;
  osrmBaseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  batchSize?: number;
  retryDelayMs?: number;
  fetcher?: typeof fetch;
}

interface OsrmTableResponse {
  code: string;
  distances: Array<Array<number | null>>;
  durations: Array<Array<number | null>>;
}

const DEFAULT_OSRM_URL = "https://router.project-osrm.org";
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_RETRY_DELAY_MS = 200;

export function distancePairKey(
  origin: Pick<DistanceEntry, "origen_tipo" | "origen_id">,
  destination: Pick<DistanceEntry, "destino_tipo" | "destino_id">,
): string {
  return JSON.stringify([
    origin.origen_tipo,
    origin.origen_id,
    destination.destino_tipo,
    destination.destino_id,
  ]);
}

function nodeKey(node: DistanceNode): string {
  return `${node.tipo}:${node.id}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toFallbackEntry(
  origin: DistanceNode,
  destination: DistanceNode,
  options: RoutingOptions,
): DistanceEntry {
  const meters = haversineDistanceMeters(
    origin,
    destination,
    options.adjustmentFactor,
  );

  return {
    origen_tipo: origin.tipo,
    origen_id: origin.id,
    destino_tipo: destination.tipo,
    destino_id: destination.id,
    metros: meters,
    segundos: fallbackDurationSeconds(meters, options.averageSpeedKmH),
    fuente: "haversine",
  };
}

async function fetchTableWithRetries(
  sources: DistanceNode[],
  destinations: DistanceNode[],
  options: RoutingOptions,
): Promise<OsrmTableResponse | null> {
  const coordinates = [...sources, ...destinations]
    .map(({ latitude, longitude }) => `${longitude},${latitude}`)
    .join(";");
  const url = new URL(`/table/v1/driving/${coordinates}`, options.osrmBaseUrl);
  url.searchParams.set(
    "sources",
    sources.map((_, index) => String(index)).join(";"),
  );
  url.searchParams.set(
    "destinations",
    destinations
      .map((_, index) => String(sources.length + index))
      .join(";"),
  );
  url.searchParams.set("annotations", "distance,duration");

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const shouldRetry = response.status === 429 || response.status >= 500;
        if (!shouldRetry || attempt === retries) return null;
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * 2 ** attempt),
        );
        continue;
      }

      const result = (await response.json()) as OsrmTableResponse;
      if (
        result.code !== "Ok" ||
        result.distances.length !== sources.length ||
        result.durations.length !== sources.length
      ) {
        return null;
      }

      return result;
    } catch {
      if (attempt === retries) return null;
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * 2 ** attempt),
      );
    }
  }

  return null;
}

export async function calculateMissingDistanceEntries(
  nodes: DistanceNode[],
  existingEntries: DistanceEntry[],
  options: RoutingOptions,
): Promise<DistanceEntry[]> {
  const seenNodes = new Set<string>();
  for (const node of nodes) {
    if (seenNodes.has(nodeKey(node))) {
      throw new Error(`El nodo ${node.tipo}:${node.id} está duplicado.`);
    }
    seenNodes.add(nodeKey(node));
  }

  const existingPairs = new Set(
    existingEntries.map((entry) =>
      distancePairKey(
        { origen_tipo: entry.origen_tipo, origen_id: entry.origen_id },
        { destino_tipo: entry.destino_tipo, destino_id: entry.destino_id },
      ),
    ),
  );
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("El tamaño de bloque debe ser un entero positivo.");
  }

  const output: DistanceEntry[] = [];
  const sourceBatches = chunk(nodes, batchSize);
  const destinationBatches = chunk(nodes, batchSize);

  for (const sources of sourceBatches) {
    for (const destinations of destinationBatches) {
      const missingPairs = sources.flatMap((origin, sourceIndex) =>
        destinations.flatMap((destination, destinationIndex) => {
          const key = distancePairKey(
            { origen_tipo: origin.tipo, origen_id: origin.id },
            { destino_tipo: destination.tipo, destino_id: destination.id },
          );

          if (nodeKey(origin) === nodeKey(destination) || existingPairs.has(key)) {
            return [];
          }

          return [{ origin, destination, key, sourceIndex, destinationIndex }];
        }),
      );

      if (missingPairs.length === 0) continue;

      const table = await fetchTableWithRetries(sources, destinations, {
        ...options,
        osrmBaseUrl: options.osrmBaseUrl ?? DEFAULT_OSRM_URL,
      });

      for (const pair of missingPairs) {
        const osrmMeters = table?.distances[pair.sourceIndex]?.[
          pair.destinationIndex
        ];
        const osrmSeconds = table?.durations[pair.sourceIndex]?.[
          pair.destinationIndex
        ];

        if (
          typeof osrmMeters === "number" &&
          Number.isFinite(osrmMeters) &&
          typeof osrmSeconds === "number" &&
          Number.isFinite(osrmSeconds)
        ) {
          output.push({
            origen_tipo: pair.origin.tipo,
            origen_id: pair.origin.id,
            destino_tipo: pair.destination.tipo,
            destino_id: pair.destination.id,
            metros: Math.round(osrmMeters),
            segundos: Math.round(osrmSeconds),
            fuente: "osrm",
          });
        } else {
          output.push(
            toFallbackEntry(pair.origin, pair.destination, options),
          );
        }
      }
    }
  }

  return output;
}