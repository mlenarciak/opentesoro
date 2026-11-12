export interface PublicDemoState {
  mode: "unknown" | "private" | "public";
  status: "ready" | "expired" | "changed" | "unavailable";
  expiresAt?: string;
  absoluteExpiresAt?: string;
}

/** Session secrets stay in memory; the session cookie itself is HttpOnly. */
export function createPublicDemoClient(
  fetcher: typeof fetch = globalThis.fetch,
) {
  let state: PublicDemoState = { mode: "unknown", status: "unavailable" };
  let csrfToken: string | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: PublicDemoState) => {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const isPublic = (response: Response) =>
    response.headers.get("X-Opentesoro-Public-Demo") === "true";
  const validDate = (value: unknown): value is string =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  function expired() {
    csrfToken = undefined;
    publish({ mode: "public", status: "expired" });
  }
  function changed() {
    csrfToken = undefined;
    publish({ mode: "public", status: "changed" });
  }
  async function acceptSession(response: Response): Promise<PublicDemoState> {
    if (
      isPublic(response) &&
      response.headers.get("X-Opentesoro-Demo-Session-Changed") === "true"
    ) {
      changed();
      return state;
    }
    if (isPublic(response) && [401, 410].includes(response.status)) {
      expired();
      return state;
    }
    if (!response.ok || !isPublic(response))
      throw new Error("Session unavailable");
    const body = await response.json();
    if (
      body.publicDemo !== true ||
      typeof body.csrfToken !== "string" ||
      !/^[A-Za-z0-9_-]{20,256}$/.test(body.csrfToken) ||
      !validDate(body.expiresAt) ||
      !validDate(body.absoluteExpiresAt)
    ) {
      throw new Error("Invalid session response");
    }
    csrfToken = body.csrfToken;
    publish({
      mode: "public",
      status: "ready",
      expiresAt: body.expiresAt,
      absoluteExpiresAt: body.absoluteExpiresAt,
    });
    return state;
  }
  async function initialize() {
    try {
      const response = await fetcher("/api/demo/session", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      // The existing private launcher has no demo session route. An outage is
      // never interpreted as permission to create a new synthetic workspace.
      if (!isPublic(response) && [401, 404].includes(response.status)) {
        csrfToken = undefined;
        publish({ mode: "private", status: "ready" });
        return;
      }
      if (isPublic(response)) publish({ ...state, mode: "public" });
      await acceptSession(response);
    } catch {
      publish({ ...state, status: "unavailable" });
    }
  }
  async function reset() {
    if (state.mode !== "public")
      throw new Error("La demo pubblica non è attiva.");
    if (state.status === "changed")
      throw new Error(
        "La demo è cambiata in un’altra scheda. Ricarica la pagina.",
      );
    const response = await fetcher("/api/demo/reset", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Opentesoro-Demo-Reset": "true",
        ...(csrfToken ? { "X-Opentesoro-Demo-CSRF": csrfToken } : {}),
      },
      body: "{}",
      signal: AbortSignal.timeout(8_000),
    });
    const accepted = await acceptSession(response);
    if (accepted.status === "changed")
      throw new Error(
        "La demo è cambiata in un’altra scheda. Ricarica la pagina.",
      );
    if (accepted.status !== "ready")
      throw new Error("Impossibile avviare una nuova demo. Riprova.");
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize,
    reset,
    expire: expired,
    requestHeaders(): Record<string, string> {
      // The generation token also protects GETs from crossing into a workspace
      // reset by another tab before this tab explicitly reloads its state.
      return state.mode === "public" && csrfToken
        ? { "X-Opentesoro-Demo-CSRF": csrfToken }
        : {};
    },
    observe(response: Response) {
      if (!isPublic(response)) return;
      if (
        response.headers.get("X-Opentesoro-Demo-Session-Changed") === "true"
      ) {
        changed();
        return;
      }
      if ([401, 410].includes(response.status)) {
        expired();
        return;
      }
      const expiresAt = response.headers.get("X-Opentesoro-Demo-Expires-At");
      const absoluteExpiresAt = response.headers.get(
        "X-Opentesoro-Demo-Absolute-Expires-At",
      );
      if (
        state.status === "ready" &&
        validDate(expiresAt) &&
        validDate(absoluteExpiresAt)
      ) {
        publish({
          mode: "public",
          status: "ready",
          expiresAt,
          absoluteExpiresAt,
        });
      }
    },
  };
}

export const publicDemoClient = createPublicDemoClient();
