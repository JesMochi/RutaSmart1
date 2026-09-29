import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPublicRequestRateLimit,
  resetPublicRequestRateLimitForTests,
} from "./rate-limit";

test("limita a tres solicitudes por IP cada diez minutos", () => {
  resetPublicRequestRateLimitForTests();

  assert.equal(checkPublicRequestRateLimit("ip-a", 0).allowed, true);
  assert.equal(checkPublicRequestRateLimit("ip-a", 1).allowed, true);
  assert.equal(checkPublicRequestRateLimit("ip-a", 2).allowed, true);
  const blocked = checkPublicRequestRateLimit("ip-a", 3);

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 600);
  assert.equal(checkPublicRequestRateLimit("ip-b", 3).allowed, true);
  assert.equal(checkPublicRequestRateLimit("ip-a", 600_001).allowed, true);

  resetPublicRequestRateLimitForTests();
});