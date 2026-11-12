import { afterEach, describe, expect, it } from "bun:test";
import {
  createPublicDemoApp,
  assertPublicDemoEnvironment,
  DEMO_COOKIE,
  DEMO_CSRF_HEADER,
  DEMO_RESET_HEADER,
} from "./public-demo";
import { createApp } from "./app";
import { Store } from "./store";
import { seedDemo } from "./demo";
const origin = "https://demo.example.invalid";
const applications: ReturnType<typeof createPublicDemoApp>[] = [];
afterEach(() => {
  for (const app of applications.splice(0)) app.close();
});
function app(options: Partial<Parameters<typeof createPublicDemoApp>[0]> = {}) {
  const result = createPublicDemoApp({ publicOrigin: origin, ...options });
  applications.push(result);
  return result;
}
const req = (path: string, options: RequestInit = {}) =>
  new Request(`http://internal-alb.invalid${path}`, options);
async function session(application: ReturnType<typeof app>) {
  const response = await application.fetch(req("/api/demo/session"));
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0]!,
    metadata: (await response.json()) as {
      publicDemo: true;
      csrfToken: string;
      expiresAt: string;
      absoluteExpiresAt: string;
    },
    response,
  };
}
function headers(
  visitor: Awaited<ReturnType<typeof session>>,
  extra: Record<string, string> = {},
) {
  return {
    cookie: visitor.cookie,
    origin,
    "content-type": "application/json",
    [DEMO_CSRF_HEADER]: visitor.metadata.csrfToken,
    ...extra,
  };
}
async function rows(application: ReturnType<typeof app>, cookie: string) {
  const response = await application.fetch(
    req("/api/v1/transactions?limit=1000", { headers: { cookie } }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { items: { id: string }[]; total: number };
}
const transaction = {
  id: "visitor-custom-transaction",
  entityId: "gb-tour",
  accountId: "intesa",
  date: "2026-11-12",
  amountMinor: 12345,
  description: "Synthetic visitor example",
  counterparty: "Demo",
};

describe("isolated server-side synthetic sessions", () => {
  it("reuses the real application, isolates mutations across visitors and marks every API response", async () => {
    const application = app();
    const first = await session(application),
      second = await session(application);
    expect(first.cookie).not.toBe(second.cookie);
    expect(first.response.headers.get("set-cookie")).toContain(
      "HttpOnly; SameSite=Strict",
    );
    expect(first.response.headers.get("set-cookie")).toContain("Secure");
    expect(first.response.headers.get("set-cookie")).not.toContain("Domain=");
    const before = (await rows(application, first.cookie)).total;
    const created = await application.fetch(
      req("/api/v1/transactions", {
        method: "POST",
        headers: headers(first),
        body: JSON.stringify(transaction),
      }),
    );
    expect(created.status).toBe(201);
    expect((await rows(application, first.cookie)).total).toBe(before + 1);
    expect((await rows(application, second.cookie)).total).toBe(before);
    const forecast = await application.fetch(
      req("/api/v1/forecast?from=2026-11-01&to=2027-04-30&scenarioId=base", {
        headers: { cookie: first.cookie },
      }),
    );
    expect(forecast.status).toBe(200);
    expect(((await forecast.json()) as { currency: string }).currency).toBe(
      "EUR",
    );
    for (const response of [
      created,
      forecast,
      await application.fetch(req("/api/v1/unknown")),
    ]) {
      expect(response.headers.get("x-opentesoro-public-demo")).toBe("true");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("requires an explicit initial session and never creates one for health, static or business requests", async () => {
    const application = app({ maxSessions: 1 });
    expect((await application.fetch(req("/health"))).status).toBe(200);
    expect((await application.fetch(req("/"))).status).toBe(200);
    const unauthorized = await application.fetch(req("/api/v1/bootstrap"));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("set-cookie")).toBeNull();
    await session(application); // Initial requests did not consume the only session slot.
  });
  it("reports idle expiry and malformed/unknown cookies without silently replacing data", async () => {
    let time = 1_000_000;
    const application = app({
      now: () => time,
      idleTtlSeconds: 60,
      absoluteTtlSeconds: 120,
    });
    const visitor = await session(application);
    time += 30_000;
    const metadata = await application.fetch(
      req("/api/demo/session", { headers: { cookie: visitor.cookie } }),
    );
    expect(((await metadata.json()) as { expiresAt: string }).expiresAt).toBe(
      visitor.metadata.expiresAt,
    ); // Metadata does not extend idle TTL.
    time += 31_000;
    for (const path of ["/api/demo/session", "/api/v1/bootstrap"]) {
      const response = await application.fetch(
        req(path, { headers: { cookie: visitor.cookie } }),
      );
      expect(response.status).toBe(410);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("x-opentesoro-public-demo")).toBe("true");
    }
    for (const cookie of [
      `${DEMO_COOKIE}=invalid`,
      `${DEMO_COOKIE}=${"a".repeat(43)}`,
      `${visitor.cookie}; ${visitor.cookie}`,
    ])
      expect(
        (
          await application.fetch(
            req("/api/demo/session", { headers: { cookie } }),
          )
        ).status,
      ).toBe(401);
  });
  it("extends business activity only until the fixed absolute lifetime", async () => {
    let time = 1_000_000;
    const application = app({
      now: () => time,
      idleTtlSeconds: 60,
      absoluteTtlSeconds: 120,
    });
    const visitor = await session(application);
    time += 50_000;
    const active = await application.fetch(
      req("/api/v1/bootstrap", { headers: { cookie: visitor.cookie } }),
    );
    expect(active.status).toBe(200);
    expect(active.headers.get("x-opentesoro-demo-expires-at")).toBe(
      new Date(time + 60_000).toISOString(),
    );
    time += 50_000;
    const capped = await application.fetch(
      req("/api/v1/bootstrap", { headers: { cookie: visitor.cookie } }),
    );
    expect(capped.headers.get("x-opentesoro-demo-expires-at")).toBe(
      visitor.metadata.absoluteExpiresAt,
    );
    time += 20_001;
    expect(
      (
        await application.fetch(
          req("/api/v1/bootstrap", { headers: { cookie: visitor.cookie } }),
        )
      ).status,
    ).toBe(410);
  });
});

describe("same-origin mutations and explicit reset", () => {
  it("requires an exact configured HTTPS origin and session CSRF token even behind an internal HTTP ALB", async () => {
    const application = app();
    const visitor = await session(application);
    for (const extra of [
      { origin: "https://attacker.invalid" },
      { origin: "null" },
      { origin: "" },
      { [DEMO_CSRF_HEADER]: "wrong" },
      { "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[]) {
      const response = await application.fetch(
        req("/api/v1/transactions", {
          method: "POST",
          headers: headers(visitor, extra),
          body: JSON.stringify(transaction),
        }),
      );
      expect(response.status).toBe(403);
    }
    const allowed = await application.fetch(
      req("/api/v1/transactions", {
        method: "POST",
        headers: headers(visitor),
        body: JSON.stringify(transaction),
      }),
    );
    expect(allowed.status).toBe(201);
    const crossOriginRead = await application.fetch(
      req("/api/demo/session", {
        headers: {
          cookie: visitor.cookie,
          origin: "https://other.example.invalid",
        },
      }),
    );
    expect(crossOriginRead.status).toBe(403);
  });
  it("resets only the current visitor and rotates the session without affecting other visitors", async () => {
    const application = app();
    const visitor = await session(application),
      other = await session(application);
    await application.fetch(
      req("/api/v1/transactions", {
        method: "POST",
        headers: headers(visitor),
        body: JSON.stringify(transaction),
      }),
    );
    const reset = await application.fetch(
      req("/api/demo/reset", {
        method: "POST",
        headers: headers(visitor),
        body: "{}",
      }),
    );
    expect(reset.status).toBe(200);
    const cookie = reset.headers.get("set-cookie")!.split(";")[0]!;
    expect(cookie).not.toBe(visitor.cookie);
    const staleTab = await application.fetch(
      req("/api/v1/bootstrap", {
        headers: { cookie, [DEMO_CSRF_HEADER]: visitor.metadata.csrfToken },
      }),
    );
    expect(staleTab.status).toBe(403);
    expect(staleTab.headers.get("x-opentesoro-demo-session-changed")).toBe(
      "true",
    );
    expect(
      (await rows(application, cookie)).items.some(
        (row) => row.id === transaction.id,
      ),
    ).toBe(false);
    expect(
      (await rows(application, other.cookie)).items.some(
        (row) => row.id === transaction.id,
      ),
    ).toBe(false);
    expect(
      (
        await application.fetch(
          req("/api/v1/bootstrap", { headers: { cookie: visitor.cookie } }),
        )
      ).status,
    ).toBe(410);
  });
  it("requires a deliberate reset after expiry and rejects a fresh reset without its explicit header", async () => {
    let time = 1_000_000;
    const application = app({
      now: () => time,
      idleTtlSeconds: 60,
      absoluteTtlSeconds: 120,
    });
    const visitor = await session(application);
    time += 61_000;
    expect(
      (
        await application.fetch(
          req("/api/demo/reset", {
            method: "POST",
            headers: headers(visitor),
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    const reset = await application.fetch(
      req("/api/demo/reset", {
        method: "POST",
        headers: headers(visitor, { [DEMO_RESET_HEADER]: "true" }),
        body: "{}",
      }),
    );
    expect(reset.status).toBe(200);
    expect(reset.headers.get("set-cookie")).toBeTruthy();
  });
});

describe("public resource and private deployment boundaries", () => {
  it("enforces session capacity and creation rate without evicting live visitor data", async () => {
    const application = app({ maxSessions: 1 });
    const visitor = await session(application);
    const full = await application.fetch(req("/api/demo/session"));
    expect(full.status).toBe(503);
    expect(full.headers.get("retry-after")).toBe("60");
    expect((await rows(application, visitor.cookie)).total).toBeGreaterThan(0);
    const reset = await application.fetch(
      req("/api/demo/reset", {
        method: "POST",
        headers: headers(visitor),
        body: "{}",
      }),
    );
    expect(reset.status).toBe(200); // Replacement can use the occupied session slot.
    const throttled = app({ newSessionsPerMinute: 1 });
    const current = await session(throttled);
    const rejectedReset = await throttled.fetch(
      req("/api/demo/reset", {
        method: "POST",
        headers: headers(current),
        body: "{}",
      }),
    );
    expect(rejectedReset.status).toBe(429);
    expect((await rows(throttled, current.cookie)).total).toBeGreaterThan(0); // Failed reset preserves the current state.
  });
  it("bounds request bytes, mutations, forecast ranges, import rows and database growth", async () => {
    const application = app({ maxMutations: 1, maxBodyBytes: 1024 });
    const visitor = await session(application);
    const large = await application.fetch(
      req("/api/v1/transactions", {
        method: "POST",
        headers: headers(visitor),
        body: JSON.stringify({ ...transaction, description: "x".repeat(2000) }),
      }),
    );
    expect(large.status).toBe(413);
    expect(
      (
        await application.fetch(
          req("/api/v1/transactions", {
            method: "POST",
            headers: headers(visitor),
            body: JSON.stringify(transaction),
          }),
        )
      ).status,
    ).toBe(429);
    const partialRange = await application.fetch(
      req("/api/v1/forecast?to=2030-11-01", {
        headers: { cookie: visitor.cookie },
      }),
    );
    expect(partialRange.status).toBe(422);
    const range = await application.fetch(
      req("/api/v1/forecast?from=2026-11-01&to=2029-11-01", {
        headers: { cookie: visitor.cookie },
      }),
    );
    expect(range.status).toBe(422);
    const imports = app();
    const importer = await session(imports);
    const csv =
      "date;description;amount\n" +
      Array.from({ length: 251 }, (_, i) => `2026-11-12;Demo ${i};1,00`).join(
        "\n",
      );
    const tooMany = await imports.fetch(
      req("/api/v1/import/preview", {
        method: "POST",
        headers: headers(importer),
        body: JSON.stringify({ csv }),
      }),
    );
    expect(tooMany.status).toBe(413);
  });
  it("enforces the hard SQLite growth quota with an atomic failure and a clear reset instruction", async () => {
    const application = app({
      maxDatabasePages: 128,
      requestsPerMinute: 600,
      maxMutations: 200,
    });
    const visitor = await session(application);
    let previousCount = 0;
    let limited = false;
    for (let index = 0; index < 150; index++) {
      const listing = await application.fetch(
        req("/api/v1/scenarios", { headers: { cookie: visitor.cookie } }),
      );
      previousCount = ((await listing.json()) as { total: number }).total;
      const response = await application.fetch(
        req("/api/v1/scenarios", {
          method: "POST",
          headers: headers(visitor),
          body: JSON.stringify({
            name: `Synthetic quota ${index} ` + "x".repeat(950),
            inflowBasisPoints: 10000,
            outflowBasisPoints: 10000,
            inflowDelayDays: 0,
            outflowDelayDays: 0,
          }),
        }),
      );
      if (response.status === 507) {
        limited = true;
        expect(
          ((await response.json()) as { detail: string }).detail,
        ).toContain("Ripristina");
        const after = await application.fetch(
          req("/api/v1/scenarios", { headers: { cookie: visitor.cookie } }),
        );
        expect(((await after.json()) as { total: number }).total).toBe(
          previousCount,
        );
        break;
      }
      expect(response.status).toBe(201);
    }
    expect(limited).toBe(true);
  });
  it("bounds concurrent reset-body readers as well as normal business requests", async () => {
    const application = app({ maxConcurrent: 1 });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const pending = application.fetch(
      req("/api/demo/reset", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          [DEMO_RESET_HEADER]: "true",
        },
        body: stream,
      }),
    );
    const busy = await application.fetch(req("/api/demo/session"));
    expect(busy.status).toBe(429);
    expect(busy.headers.get("x-opentesoro-public-demo")).toBe("true");
    controller.enqueue(new TextEncoder().encode("{}"));
    controller.close();
    expect((await pending).status).toBe(200);
  });
  it("enforces a per-visitor request rate", async () => {
    const application = app({ requestsPerMinute: 1 });
    const visitor = await session(application);
    expect(
      (
        await application.fetch(
          req("/api/v1/bootstrap", { headers: { cookie: visitor.cookie } }),
        )
      ).status,
    ).toBe(200);
    const limited = await application.fetch(
      req("/api/v1/bootstrap", { headers: { cookie: visitor.cookie } }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("x-opentesoro-public-demo")).toBe("true");
  });
  it("refuses persistent paths and private/provider credentials without weakening the original app's token authentication", async () => {
    for (const environment of [
      { DATABASE_PATH: "/private.sqlite" },
      { OPENTESORO_API_TOKEN: "secret" },
      { OPENTESORO_READ_ONLY_TOKEN: "secret" },
      { AGICAP_CLIENT_SECRET: "secret" },
      { OPENTESORO_DEMO: "false" },
    ])
      expect(() => assertPublicDemoEnvironment(environment)).toThrow();
    expect(() =>
      assertPublicDemoEnvironment({ DATABASE_PATH: ":memory:" }),
    ).not.toThrow();
    const store = new Store(":memory:");
    seedDemo(store);
    try {
      const privateApp = createApp(store, {
        token: "private-token-required-for-private-app",
      });
      expect((await privateApp(req("/api/v1/bootstrap"))).status).toBe(401);
    } finally {
      store.close();
    }
    const application = app();
    expect(
      (
        await application.fetch(
          req("/api/demo/session", {
            headers: { authorization: "Bearer never-submit-real-tokens" },
          }),
        )
      ).status,
    ).toBe(400);
  });
});
