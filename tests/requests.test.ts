import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/solicitudes/route";
import { resetPublicRequestRateLimitForTests } from "../lib/requests/rate-limit";

const validPayload = {
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

function requestFor(payload: unknown, address: string) {
  return new Request("http://localhost/api/solicitudes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": address,
    },
    body: JSON.stringify(payload),
  });
}

test("inserta una solicitud válida usando el anon key y campos permitidos", async () => {
  resetPublicRequestRateLimitForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rutasmart-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

  const originalFetch = globalThis.fetch;
  const insertedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/rest\/v1\/solicitudes$/);
    insertedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(null, { status: 201 });
  };

  try {
    const response = await POST(requestFor(validPayload, "test-valid"));
    assert.equal(response.status, 201);
    assert.equal(insertedBodies[0]?.campo_trampa, "");
    assert.equal(insertedBodies[0]?.telefono, "5512345678");
    assert.equal("rol" in (insertedBodies[0] ?? {}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("un honeypot lleno responde sin guardar datos", async () => {
  resetPublicRequestRateLimitForTests();
  const originalFetch = globalThis.fetch;
  let calledSupabase = false;
  globalThis.fetch = async () => {
    calledSupabase = true;
    return new Response(null, { status: 201 });
  };

  try {
    const response = await POST(
      requestFor({ ...validPayload, honeypot: "sitio falso" }, "test-bot"),
    );
    assert.equal(response.status, 202);
    assert.equal(calledSupabase, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("el endpoint exige que el honeypot esté presente", async () => {
  resetPublicRequestRateLimitForTests();
  const withoutHoneypot: Record<string, unknown> = { ...validPayload };
  delete withoutHoneypot.honeypot;
  const response = await POST(requestFor(withoutHoneypot, "test-missing-honeypot"));
  const body = (await response.json()) as { fields?: { honeypot?: string } };

  assert.equal(response.status, 400);
  assert.ok(body.fields?.honeypot);
});

test("el endpoint limita a tres envíos por dirección en diez minutos", async () => {
  resetPublicRequestRateLimitForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rutasmart-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 201 });

  try {
    await POST(requestFor(validPayload, "test-rate-limit"));
    await POST(requestFor(validPayload, "test-rate-limit"));
    await POST(requestFor(validPayload, "test-rate-limit"));
    const blocked = await POST(requestFor(validPayload, "test-rate-limit"));

    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("Retry-After"), "600");
  } finally {
    globalThis.fetch = originalFetch;
  }
});