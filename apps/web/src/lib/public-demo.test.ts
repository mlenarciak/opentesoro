import { describe, expect, test } from "bun:test";
import { createPublicDemoClient } from "./public-demo";

const session = {
  publicDemo: true,
  csrfToken: "a".repeat(43),
  expiresAt: "2040-01-01T00:30:00.000Z",
  absoluteExpiresAt: "2040-01-01T02:00:00.000Z",
};
const reply = (body: unknown = session, status = 200) =>
  Response.json(body, {
    status,
    headers: { "X-Opentesoro-Public-Demo": "true" },
  });
function clientWith(response: () => Response | Promise<Response>) {
  return createPublicDemoClient((async () =>
    response()) as unknown as typeof fetch);
}
describe("public demo session boundary", () => {
  test("initializes before API use and binds reads and writes to the workspace generation", async () => {
    const client = clientWith(() => reply());
    expect(client.getSnapshot().status).toBe("unavailable");
    await client.initialize();
    expect(client.getSnapshot()).toEqual({
      mode: "public",
      status: "ready",
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    });
    expect(client.requestHeaders()["X-Opentesoro-Demo-CSRF"]).toBe(
      session.csrfToken,
    );
    expect(client.requestHeaders()["X-Opentesoro-Demo-CSRF"]).toBe(
      session.csrfToken,
    );
    expect(JSON.stringify(client.getSnapshot())).not.toContain(
      session.csrfToken,
    );
  });
  test("recognizes legacy private endpoints without weakening their auth", async () => {
    for (const status of [401, 404]) {
      const client = clientWith(() => new Response(null, { status }));
      await client.initialize();
      expect(client.getSnapshot()).toEqual({
        mode: "private",
        status: "ready",
      });
      expect(client.requestHeaders()).toEqual({});
    }
  });
  test("public invalid or expired sessions cannot silently become private or new", async () => {
    for (const status of [401, 410]) {
      const client = clientWith(() => reply({}, status));
      await client.initialize();
      expect(client.getSnapshot()).toEqual({
        mode: "public",
        status: "expired",
      });
      expect(client.requestHeaders()).toEqual({});
    }
  });
  test("outages and malformed responses never create a private fallback", async () => {
    for (const result of [
      new Response(null, { status: 503 }),
      reply({ publicDemo: true, csrfToken: "bad" }),
      new Response("<html></html>"),
    ]) {
      const client = clientWith(() => result);
      await client.initialize();
      expect(client.getSnapshot().status).toBe("unavailable");
      expect(client.getSnapshot().mode).not.toBe("private");
    }
    const client = clientWith(() => {
      throw new Error("network unavailable");
    });
    await client.initialize();
    expect(client.getSnapshot()).toEqual({
      mode: "unknown",
      status: "unavailable",
    });
  });
  test("business responses extend inactivity time and expiry drops the CSRF secret", async () => {
    const client = clientWith(() => reply());
    await client.initialize();
    client.observe(
      new Response(null, {
        headers: {
          "X-Opentesoro-Public-Demo": "true",
          "X-Opentesoro-Demo-Expires-At": "2040-01-01T00:45:00.000Z",
          "X-Opentesoro-Demo-Absolute-Expires-At": session.absoluteExpiresAt,
        },
      }),
    );
    expect(client.getSnapshot().expiresAt).toBe("2040-01-01T00:45:00.000Z");
    client.observe(reply({}, 410));
    expect(client.getSnapshot()).toEqual({ mode: "public", status: "expired" });
    expect(client.requestHeaders()).toEqual({});
  });
  test("only explicit reset replaces a session and is never offered to private mode", async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const client = createPublicDemoClient((async (
      path: string,
      init?: RequestInit,
    ) => {
      calls.push({ path, init });
      return reply(
        path.endsWith("reset")
          ? { ...session, csrfToken: "b".repeat(43) }
          : session,
      );
    }) as unknown as typeof fetch);
    await client.initialize();
    await client.reset();
    expect(calls[1]?.path).toBe("/api/demo/reset");
    expect(calls[1]?.init?.method).toBe("POST");
    expect(
      new Headers(calls[1]?.init?.headers).get("X-Opentesoro-Demo-Reset"),
    ).toBe("true");
    expect(
      new Headers(calls[1]?.init?.headers).get("X-Opentesoro-Demo-CSRF"),
    ).toBe(session.csrfToken);
    expect(client.requestHeaders()["X-Opentesoro-Demo-CSRF"]).toBe(
      "b".repeat(43),
    );
    const privateClient = clientWith(() => new Response(null, { status: 404 }));
    await privateClient.initialize();
    await expect(privateClient.reset()).rejects.toThrow("non è attiva");
  });
  test("another tab's reset freezes both reads and writes until deliberate reload", async () => {
    const client = clientWith(() => reply());
    await client.initialize();
    client.observe(
      new Response(null, {
        status: 403,
        headers: {
          "X-Opentesoro-Public-Demo": "true",
          "X-Opentesoro-Demo-Session-Changed": "true",
        },
      }),
    );
    expect(client.getSnapshot()).toEqual({ mode: "public", status: "changed" });
    expect(client.requestHeaders()).toEqual({});
    await expect(client.reset()).rejects.toThrow("Ricarica");
  });
  test("a rejected reset detects another tab's generation and cannot reset it again", async () => {
    let calls = 0;
    const client = clientWith(() =>
      ++calls === 1
        ? reply()
        : new Response(null, {
            status: 403,
            headers: {
              "X-Opentesoro-Public-Demo": "true",
              "X-Opentesoro-Demo-Session-Changed": "true",
            },
          }),
    );
    await client.initialize();
    await expect(client.reset()).rejects.toThrow("Ricarica");
    expect(client.getSnapshot()).toEqual({ mode: "public", status: "changed" });
    expect(client.requestHeaders()).toEqual({});
    await expect(client.reset()).rejects.toThrow("Ricarica");
    expect(calls).toBe(2);
  });
});
