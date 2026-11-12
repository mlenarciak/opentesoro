import { randomBytes, timingSafeEqual } from "node:crypto";
import { createApp, HttpError } from "./app";
import { seedDemo } from "./demo";
import { previewCsv } from "./csv";
import { Store, type Collection, type RecordData } from "./store";
import { dateRange } from "@opentesoro/engine";

export const DEMO_COOKIE = "__Host-opentesoro-demo";
export const DEMO_CSRF_HEADER = "x-opentesoro-demo-csrf";
export const DEMO_RESET_HEADER = "x-opentesoro-demo-reset";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
type Handler = ReturnType<typeof createApp>;
type Session = {
  id: string;
  csrf: string;
  store: Store;
  app: Handler;
  createdAt: number;
  lastActivity: number;
  inFlight: number;
  retired: boolean;
  requests: number;
  mutations: number;
  windowStart: number;
};
export interface PublicDemoOptions {
  publicOrigin: string;
  staticDir?: string;
  maxSessions?: number;
  idleTtlSeconds?: number;
  absoluteTtlSeconds?: number;
  maxDatabasePages?: number;
  maxBodyBytes?: number;
  maxMutations?: number;
  requestsPerMinute?: number;
  maxConcurrent?: number;
  newSessionsPerMinute?: number;
  /** Clock injection keeps expiry tests deterministic; it is not an HTTP/environment override. */
  now?: () => number;
}
class DemoFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
/** Translate SQLite's hard quota failure without logging supplied financial payloads. */
class DemoStore extends Store {
  private quota<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as Error & { code?: string }).code === "SQLITE_FULL" ||
          error.message.includes("database or disk is full"))
      )
        throw new HttpError(
          507,
          "La memoria della demo è piena. Ripristina i dati di esempio per continuare.",
        );
      throw error;
    }
  }
  override put(collection: Collection, record: RecordData, actor?: string) {
    return this.quota(() => super.put(collection, record, actor));
  }
  override remove(collection: Collection, id: string, actor?: string) {
    return this.quota(() => super.remove(collection, id, actor));
  }
  override atomic<T>(operation: () => T): T {
    return this.quota(() => super.atomic(operation));
  }
}
const random = () => randomBytes(32).toString("base64url");
function bounded(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
) {
  const chosen = value ?? fallback;
  if (!Number.isInteger(chosen) || chosen < min || chosen > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return chosen;
}
function sameSecret(actual: string | null, expected: string) {
  if (actual === null) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function assertPublicDemoEnvironment(
  env: Record<string, string | undefined>,
) {
  if (env.DATABASE_PATH && env.DATABASE_PATH !== ":memory:")
    throw new Error("Public demo forbids a persistent DATABASE_PATH");
  const forbidden = Object.entries(env).some(
    ([name, value]) =>
      !!value &&
      (name === "OPENTESORO_API_TOKEN" ||
        name === "OPENTESORO_READ_ONLY_TOKEN" ||
        name.startsWith("AGICAP_")),
  );
  if (forbidden)
    throw new Error(
      "Public demo must not receive private API tokens or provider credentials",
    );
  if (env.OPENTESORO_DEMO === "false")
    throw new Error("Public demo always uses synthetic seed data");
}
export function createPublicDemoApp(options: PublicDemoOptions) {
  const originUrl = new URL(options.publicOrigin);
  if (
    originUrl.origin !== options.publicOrigin ||
    originUrl.username ||
    originUrl.password ||
    (originUrl.protocol !== "https:" &&
      !(
        originUrl.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(originUrl.hostname)
      ))
  )
    throw new Error(
      "PUBLIC_DEMO_ORIGIN must be one HTTPS origin (or HTTP loopback for development)",
    );
  const now = options.now ?? Date.now;
  const limits = {
    maxSessions: bounded(options.maxSessions, 32, 1, 128, "maxSessions"),
    idleTtlSeconds: bounded(
      options.idleTtlSeconds,
      1800,
      60,
      7200,
      "idleTtlSeconds",
    ),
    absoluteTtlSeconds: bounded(
      options.absoluteTtlSeconds,
      7200,
      60,
      14400,
      "absoluteTtlSeconds",
    ),
    maxDatabasePages: bounded(
      options.maxDatabasePages,
      512,
      128,
      2048,
      "maxDatabasePages",
    ),
    maxBodyBytes: bounded(
      options.maxBodyBytes,
      128 * 1024,
      1024,
      256 * 1024,
      "maxBodyBytes",
    ),
    maxMutations: bounded(options.maxMutations, 200, 1, 1000, "maxMutations"),
    requestsPerMinute: bounded(
      options.requestsPerMinute,
      120,
      1,
      600,
      "requestsPerMinute",
    ),
    maxConcurrent: bounded(options.maxConcurrent, 16, 1, 32, "maxConcurrent"),
    newSessionsPerMinute: bounded(
      options.newSessionsPerMinute,
      12,
      1,
      60,
      "newSessionsPerMinute",
    ),
    maxForecastDays: 366,
    maxImportRows: 250,
  };
  if (limits.absoluteTtlSeconds < limits.idleTtlSeconds)
    throw new Error(
      "Absolute demo lifetime must not be shorter than idle lifetime",
    );
  const sessions = new Map<string, Session>();
  const retiredIds = new Map<string, number>();
  // The shared app is used solely for static/public metadata routes, never a business API.
  const staticStore = new Store(":memory:");
  const staticApp = createApp(staticStore, { staticDir: options.staticDir });
  let activeRequests = 0,
    closed = false,
    creationWindow = now(),
    creations = 0;
  const expiry = (session: Session) =>
    Math.min(
      session.createdAt + limits.absoluteTtlSeconds * 1000,
      session.lastActivity + limits.idleTtlSeconds * 1000,
    );
  function retire(session: Session) {
    if (session.retired) return;
    session.retired = true;
    sessions.delete(session.id);
    retiredIds.set(session.id, now() + limits.absoluteTtlSeconds * 1000);
    while (retiredIds.size > limits.maxSessions * 4)
      retiredIds.delete(retiredIds.keys().next().value!);
    if (!session.inFlight) session.store.close();
  }
  function sweep() {
    const time = now();
    for (const session of sessions.values())
      if (time >= expiry(session)) retire(session);
    for (const [id, until] of retiredIds)
      if (time >= until) retiredIds.delete(id);
  }
  function parseCookie(request: Request): string | undefined {
    const cookies = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${DEMO_COOKIE}=`));
    if (cookies.length > 1)
      throw new DemoFailure(
        401,
        "DEMO_SESSION_INVALID",
        "La sessione demo non è valida. Avvia una nuova demo.",
      );
    if (!cookies.length) return undefined;
    const id = cookies[0]!.slice(DEMO_COOKIE.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(id))
      throw new DemoFailure(
        401,
        "DEMO_SESSION_INVALID",
        "La sessione demo non è valida. Avvia una nuova demo.",
      );
    return id;
  }
  function findSession(request: Request): Session {
    const id = parseCookie(request);
    if (!id)
      throw new DemoFailure(
        401,
        "DEMO_SESSION_REQUIRED",
        "Avvia una sessione demo prima di usare il workspace.",
      );
    const session = sessions.get(id);
    if (!session)
      throw new DemoFailure(
        retiredIds.has(id) ? 410 : 401,
        retiredIds.has(id) ? "DEMO_SESSION_EXPIRED" : "DEMO_SESSION_INVALID",
        "La sessione demo è terminata. Puoi avviare una nuova demo.",
      );
    if (now() >= expiry(session)) {
      retire(session);
      throw new DemoFailure(
        410,
        "DEMO_SESSION_EXPIRED",
        "La sessione demo è scaduta. Puoi avviare una nuova demo.",
      );
    }
    return session;
  }
  function checkOrigin(request: Request, mutation: boolean) {
    const origin = request.headers.get("origin"),
      site = request.headers.get("sec-fetch-site");
    if (
      (origin && origin !== options.publicOrigin) ||
      (site && !["same-origin", "none"].includes(site)) ||
      (mutation && origin !== options.publicOrigin)
    )
      throw new DemoFailure(
        403,
        "DEMO_ORIGIN_REJECTED",
        "Le operazioni demo sono disponibili solo da questo sito.",
      );
    if (request.headers.has("authorization"))
      throw new DemoFailure(
        400,
        "DEMO_CREDENTIALS_FORBIDDEN",
        "La demo pubblica non richiede token. Non inserire credenziali o dati reali.",
      );
  }
  function checkMutation(
    request: Request,
    session?: Session,
    explicitReset = false,
  ) {
    checkOrigin(request, true);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]!
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw new DemoFailure(
        415,
        "DEMO_JSON_REQUIRED",
        "Usa application/json per modificare la demo.",
      );
    if (
      session &&
      !sameSecret(request.headers.get(DEMO_CSRF_HEADER), session.csrf)
    )
      throw new DemoFailure(
        403,
        "DEMO_CSRF_REJECTED",
        "Aggiorna la pagina prima di modificare la demo.",
      );
    if (
      !session &&
      (!explicitReset || request.headers.get(DEMO_RESET_HEADER) !== "true")
    )
      throw new DemoFailure(
        403,
        "DEMO_EXPLICIT_RESET_REQUIRED",
        "Conferma l’avvio di una nuova sessione demo.",
      );
  }
  function createSession(replacing?: Session): Session {
    sweep();
    if (
      sessions.size - (replacing && !replacing.retired ? 1 : 0) >=
      limits.maxSessions
    )
      throw new DemoFailure(
        503,
        "DEMO_CAPACITY_REACHED",
        "Tutte le demo sono occupate. Riprova tra poco.",
      );
    const time = now();
    if (time - creationWindow >= 60_000) {
      creationWindow = time;
      creations = 0;
    }
    if (creations >= limits.newSessionsPerMinute)
      throw new DemoFailure(
        429,
        "DEMO_CREATION_LIMIT",
        "Troppe nuove sessioni demo. Riprova tra un minuto.",
      );
    creations += 1;
    const store = new DemoStore(":memory:");
    try {
      store.db.exec(
        `PRAGMA max_page_count=${limits.maxDatabasePages}; PRAGMA cache_size=-256; PRAGMA temp_store=MEMORY;`,
      );
      seedDemo(store);
      const session: Session = {
        id: random(),
        csrf: random(),
        store,
        app: createApp(store, { allowedOrigins: [options.publicOrigin] }),
        createdAt: time,
        lastActivity: time,
        inFlight: 0,
        retired: false,
        requests: 0,
        mutations: 0,
        windowStart: time,
      };
      if (replacing) retire(replacing);
      sessions.set(session.id, session);
      return session;
    } catch {
      store.close();
      throw new DemoFailure(
        503,
        "DEMO_UNAVAILABLE",
        "La demo non è disponibile. Riprova tra poco.",
      );
    }
  }
  function sessionData(session: Session) {
    return {
      publicDemo: true,
      csrfToken: session.csrf,
      expiresAt: new Date(expiry(session)).toISOString(),
      absoluteExpiresAt: new Date(
        session.createdAt + limits.absoluteTtlSeconds * 1000,
      ).toISOString(),
      limits: {
        maxBodyBytes: limits.maxBodyBytes,
        maxMutations: limits.maxMutations,
        maxForecastDays: limits.maxForecastDays,
        maxImportRows: limits.maxImportRows,
      },
    };
  }
  function decorate(
    response: Response,
    session?: Session,
    setCookie = false,
  ): Response {
    response.headers.set("X-Opentesoro-Public-Demo", "true");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "same-origin");
    response.headers.set("X-Frame-Options", "DENY");
    if (session && !session.retired) {
      response.headers.set(
        "X-Opentesoro-Demo-Expires-At",
        new Date(expiry(session)).toISOString(),
      );
      response.headers.set(
        "X-Opentesoro-Demo-Absolute-Expires-At",
        new Date(
          session.createdAt + limits.absoluteTtlSeconds * 1000,
        ).toISOString(),
      );
      if (setCookie)
        response.headers.set(
          "Set-Cookie",
          `${DEMO_COOKIE}=${session.id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(1, Math.floor((session.createdAt + limits.absoluteTtlSeconds * 1000 - now()) / 1000))}`,
        );
    }
    return response;
  }
  function fail(error: unknown) {
    const known = error instanceof DemoFailure;
    const response = Response.json(
      {
        publicDemo: true,
        code: known ? error.code : "DEMO_UNAVAILABLE",
        status: known ? error.status : 503,
        detail: known
          ? error.message
          : "La demo non è disponibile. Riprova tra poco.",
      },
      { status: known ? error.status : 503 },
    );
    if (
      known &&
      ["DEMO_CSRF_REJECTED", "DEMO_SESSION_CHANGED"].includes(error.code)
    )
      response.headers.set("X-Opentesoro-Demo-Session-Changed", "true");
    if (response.status === 429 || response.status === 503)
      response.headers.set("Retry-After", "60");
    return decorate(response);
  }
  async function readBody(request: Request): Promise<Uint8Array | undefined> {
    const declared = request.headers.get("content-length");
    if (
      declared &&
      (!/^\d+$/.test(declared) || Number(declared) > limits.maxBodyBytes)
    )
      throw new DemoFailure(
        413,
        "DEMO_BODY_LIMIT",
        "La demo accetta richieste fino a 128 KiB.",
      );
    if (!request.body) return undefined;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new DemoFailure(
            408,
            "DEMO_BODY_TIMEOUT",
            "La richiesta demo è scaduta.",
          ),
        );
        void reader.cancel();
      }, 10_000);
    });
    try {
      while (true) {
        const result = await Promise.race([reader.read(), timeout]);
        if (result.done) break;
        total += result.value.byteLength;
        if (total > limits.maxBodyBytes) {
          void reader.cancel();
          throw new DemoFailure(
            413,
            "DEMO_BODY_LIMIT",
            "La demo accetta richieste fino a 128 KiB.",
          );
        }
        chunks.push(result.value);
      }
      return Buffer.concat(chunks, total);
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
  }
  function checkResourceBudget(
    request: Request,
    bytes: Uint8Array | undefined,
  ) {
    const url = new URL(request.url);
    const route = url.pathname;
    if (route === "/api/v1/forecast") {
      const from = url.searchParams.get("from"),
        to = url.searchParams.get("to");
      if (from || to) {
        if (!from || !to)
          throw new DemoFailure(
            422,
            "DEMO_FORECAST_LIMIT",
            "Specifica entrambe le date per un intervallo demo fino a 366 giorni.",
          );
        try {
          dateRange(from, to, limits.maxForecastDays);
        } catch {
          throw new DemoFailure(
            422,
            "DEMO_FORECAST_LIMIT",
            "Nella demo scegli un intervallo fino a 366 giorni.",
          );
        }
      }
    }
    if (
      ["/api/v1/import/preview", "/api/v1/import/commit"].includes(route) &&
      bytes
    ) {
      try {
        const input = JSON.parse(new TextDecoder().decode(bytes));
        if (
          typeof input.csv === "string" &&
          previewCsv(input.csv).totalRows > limits.maxImportRows
        )
          throw new DemoFailure(
            413,
            "DEMO_IMPORT_LIMIT",
            "La demo accetta fino a 250 righe CSV per importazione.",
          );
      } catch (error) {
        if (error instanceof DemoFailure)
          throw error; /* Existing API reports malformed JSON/CSV with its own validation. */
      }
    }
  }
  const sweepTimer = setInterval(sweep, 30_000);
  sweepTimer.unref();
  return {
    limits,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const isApi = url.pathname.startsWith("/api/");
      if (closed)
        return fail(
          new DemoFailure(503, "DEMO_CLOSED", "La demo non è disponibile."),
        );
      if (!isApi) return staticApp(request);
      if (activeRequests >= limits.maxConcurrent)
        return fail(
          new DemoFailure(
            429,
            "DEMO_BUSY",
            "La demo è occupata. Riprova tra poco.",
          ),
        );
      activeRequests += 1;
      try {
        checkOrigin(request, false);
        sweep();
        if (url.pathname === "/api/demo/session") {
          if (request.method !== "GET")
            throw new DemoFailure(
              405,
              "DEMO_METHOD_NOT_ALLOWED",
              "Usa GET per aprire la demo.",
            );
          const id = parseCookie(request);
          const session = id ? findSession(request) : createSession();
          return decorate(Response.json(sessionData(session)), session, true);
        }
        if (url.pathname === "/api/demo/reset") {
          if (request.method !== "POST")
            throw new DemoFailure(
              405,
              "DEMO_METHOD_NOT_ALLOWED",
              "Usa POST per ripristinare la demo.",
            );
          let previous: Session | undefined;
          try {
            previous = findSession(request);
          } catch (error) {
            if (
              !(error instanceof DemoFailure) ||
              ![401, 410].includes(error.status)
            )
              throw error;
          }
          checkMutation(request, previous, true);
          const resetBody = await readBody(request);
          try {
            const input = JSON.parse(new TextDecoder().decode(resetBody));
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error();
          } catch {
            throw new DemoFailure(
              400,
              "DEMO_RESET_BODY",
              "Il ripristino richiede un oggetto JSON vuoto.",
            );
          }
          if (previous?.retired)
            throw new DemoFailure(
              410,
              "DEMO_SESSION_EXPIRED",
              "La sessione è terminata durante il ripristino. Riprova.",
            );
          if (previous?.inFlight)
            throw new DemoFailure(
              409,
              "DEMO_BUSY",
              "Attendi che le operazioni in corso finiscano e riprova.",
            );
          const session = createSession(previous);
          return decorate(Response.json(sessionData(session)), session, true);
        }
        const session = findSession(request);
        const presentedCsrf = request.headers.get(DEMO_CSRF_HEADER);
        if (presentedCsrf !== null && !sameSecret(presentedCsrf, session.csrf))
          throw new DemoFailure(
            403,
            "DEMO_SESSION_CHANGED",
            "La sessione è cambiata in un’altra scheda. Ricarica questa pagina.",
          );
        if (
          !["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(request.method)
        )
          throw new DemoFailure(
            405,
            "DEMO_METHOD_NOT_ALLOWED",
            "Metodo non disponibile nella demo.",
          );
        const mutation = unsafeMethods.has(request.method);
        if (mutation) checkMutation(request, session);
        const time = now();
        if (time - session.windowStart >= 60_000) {
          session.windowStart = time;
          session.requests = 0;
        }
        if (session.requests >= limits.requestsPerMinute)
          throw new DemoFailure(
            429,
            "DEMO_RATE_LIMIT",
            "Troppe richieste. Riprova tra un minuto.",
          );
        if (mutation && session.mutations >= limits.maxMutations)
          throw new DemoFailure(
            429,
            "DEMO_MUTATION_LIMIT",
            "Hai raggiunto il limite di modifiche. Ripristina la demo per continuare.",
          );
        if (session.inFlight >= 2)
          throw new DemoFailure(
            429,
            "DEMO_BUSY",
            "La demo è occupata. Riprova tra poco.",
          );
        session.requests += 1;
        if (mutation) session.mutations += 1;
        session.lastActivity = time;
        session.inFlight += 1;
        try {
          const bytes = mutation ? await readBody(request) : undefined;
          checkResourceBudget(request, bytes);
          const delegated =
            bytes === undefined
              ? request
              : new Request(request, { body: new Uint8Array(bytes).buffer });
          const response = await session.app(delegated);
          return decorate(response, session);
        } finally {
          session.inFlight -= 1;
          if (session.retired && !session.inFlight) session.store.close();
        }
      } catch (error) {
        return fail(error);
      } finally {
        activeRequests -= 1;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(sweepTimer);
      for (const session of [...sessions.values()]) retire(session);
      staticStore.close();
      retiredIds.clear();
    },
  };
}
