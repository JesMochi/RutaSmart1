const WINDOW_MS = 10 * 60 * 1000;
const REQUEST_LIMIT = 3;

const requestsByAddress = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkPublicRequestRateLimit(
  address: string,
  now = Date.now(),
): RateLimitResult {
  const recentRequests = (requestsByAddress.get(address) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );

  if (recentRequests.length >= REQUEST_LIMIT) {
    const retryAfterMs = Math.max(0, recentRequests[0] + WINDOW_MS - now);
    requestsByAddress.set(address, recentRequests);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  recentRequests.push(now);
  requestsByAddress.set(address, recentRequests);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientAddress(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

export function resetPublicRequestRateLimitForTests(): void {
  requestsByAddress.clear();
}