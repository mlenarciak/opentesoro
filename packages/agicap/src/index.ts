/** Current Agicap Public API adapter. Business data is read-only. */
const ORIGIN = "https://api.agicap.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;
export type FetchTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type AgicapErrorCode =
  | "http"
  | "transport"
  | "malformed_response"
  | "timeout"
  | "aborted"
  | "disposed";

/** Deliberately excludes response bodies, credentials, headers, and transport exception messages. */
export class AgicapError extends Error {
  readonly name = "AgicapError";
  constructor(
    readonly code: AgicapErrorCode,
    readonly operation: string,
    readonly status?: number,
  ) {
    super(
      status === undefined
        ? `Agicap ${operation}: ${code}`
        : `Agicap ${operation}: HTTP ${status}`,
    );
  }
}
export interface AgicapClientOptions {
  clientId: string;
  clientSecret: string;
  /** Injectable for contract tests. Production defaults to global fetch. */
  fetch?: FetchTransport;
  /** Per-attempt deadline, including response body; default 15 seconds. */
  timeoutMs?: number;
  /** GET-only 429/503 retries, 0–3; default 2. Token exchange is never retried automatically. */
  maxRetries?: number;
  /** Maximum JSON response bytes; default 8 MiB. */
  maxResponseBytes?: number;
  /** Clock injection is useful for expiry tests. */
  now?: () => number;
  /** Timer injection for tests. Must respect AbortSignal. */
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}
export interface ReadOptions {
  signal?: AbortSignal;
}
export interface PageOptions extends ReadOptions {
  pageNumber?: number;
  pageSize?: number;
}
export interface Pagination {
  currentPageItemsCount: number;
  currentPageNumber: number;
  pageSize: number;
  pagesCount?: number;
  totalItemsCount: number;
}
export interface Page<T> {
  items: T[];
  pagination: Pagination;
}
export interface Organization {
  id: string;
  name: string;
}
export interface Entity {
  id: number;
  name: string;
  country: string;
}
export interface BankAccountMetadata {
  AccountNumber: string;
  ConnectionId: string;
  CreatedAt: string;
  EntityId: number;
}
export interface BankConnectionMetadata {
  Id: string;
  Name: string;
  Type: string;
}
/** Banking product's PascalCase wire response is retained deliberately. */
export interface BankingPage<T> {
  Items: T[] | null;
  Pagination: {
    CurrentPageItemsCount: number;
    CurrentPageNumber: number;
    PageSize: number;
    PagesCount?: number;
    TotalItemsCount: number;
  };
}
export interface JournalExportSummary {
  exportId: string;
  exportDateUtc: string;
  exportIndexInYear: number;
  exportYear: number;
  numberOfEntries: number;
  indexInYearOfFirstEntryInBankJournal: number;
  indexInYearOfLastEntryInBankJournal: number;
}
export interface JournalCursor {
  before?: string | null;
  after?: string | null;
  size: number;
}
export interface JournalExportPage {
  items: JournalExportSummary[];
  cursor: JournalCursor;
}
/** Amounts remain raw unknown fields: journal values can carry four decimal places. */
export interface JournalEntry extends JsonObject {
  agicapUniqueId: string;
  name: string;
  paymentDate: string;
  originalCurrency: string;
  accountingCurrency: string;
}
export interface JournalExport {
  exportId: string;
  entityName: string;
  year: number;
  bankJournalExportIndexInYear: number;
  entries: JournalEntry[];
}
export type JournalQuery = ReadOptions & { size?: number } & (
    | { after: string; before?: never }
    | { before: string; after?: never }
  );
export type AccessProbe =
  | { state: "accessible" }
  | { state: "not_accessible"; status: 401 | 403 | 404 }
  | { state: "unknown"; errorCode: AgicapErrorCode; status?: number };
export interface AccessibleFeatures {
  /** These are successful endpoint probes, not subscription/permission declarations. */
  organizations: AccessProbe;
  entities: AccessProbe;
  bankAccounts: AccessProbe;
  journalExports: AccessProbe;
}

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("object");
  return value as JsonObject;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("string");
  return value;
}
function integer(value: unknown, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min)
    throw new Error("integer");
  return value;
}
function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("array");
  return value.map(parse);
}
function pagination(value: unknown, pascal = false): Pagination {
  const p = object(value);
  const get = (key: string) =>
    p[pascal ? key[0]!.toUpperCase() + key.slice(1) : key];
  const result: Pagination = {
    currentPageItemsCount: integer(get("currentPageItemsCount")),
    currentPageNumber: integer(get("currentPageNumber")),
    pageSize: integer(get("pageSize")),
    totalItemsCount: integer(get("totalItemsCount")),
  };
  const count = get("pagesCount");
  if (count !== undefined) result.pagesCount = integer(count);
  return result;
}
function parseBankingPage<T>(
  value: unknown,
  parse: (item: unknown) => T,
): BankingPage<T> {
  const body = object(value),
    page = pagination(body.Pagination, true);
  return {
    Items: body.Items === null ? null : array(body.Items, parse),
    Pagination: {
      CurrentPageItemsCount: page.currentPageItemsCount,
      CurrentPageNumber: page.currentPageNumber,
      PageSize: page.pageSize,
      TotalItemsCount: page.totalItemsCount,
      ...(page.pagesCount === undefined ? {} : { PagesCount: page.pagesCount }),
    },
  };
}
function id(value: string): string {
  if (!UUID.test(value)) throw new TypeError("An Agicap UUID is required");
  return value;
}
function entityId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
    throw new TypeError("A positive int32 entity ID is required");
  return value;
}
function calendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new TypeError("A calendar date is required");
  const parsed = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new TypeError("Invalid calendar date");
  return value;
}
function timestamp(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError("An ISO datetime with an explicit offset is required");
  }
  calendarDate(value.slice(0, 10));
  const hour = Number(value.slice(11, 13)),
    minute = Number(value.slice(14, 16)),
    second = Number(value.slice(17, 19));
  if (hour > 23 || minute > 59 || second > 59)
    throw new TypeError("Invalid datetime");
  return value;
}
function pageQuery(options: PageOptions, pascal = false): URLSearchParams {
  const pageNumber = options.pageNumber ?? 1,
    pageSize = options.pageSize ?? 100;
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > 21_474_836
  )
    throw new TypeError("Invalid page number");
  if (!Number.isInteger(pageSize) || pageSize < 2 || pageSize > 100)
    throw new TypeError("Page size must be between 2 and 100");
  return new URLSearchParams(
    pascal
      ? { PageNumber: String(pageNumber), PageSize: String(pageSize) }
      : { pageNumber: String(pageNumber), pageSize: String(pageSize) },
  );
}
function aborted(signal: AbortSignal, operation: string): AgicapError {
  return new AgicapError(
    signal.reason instanceof DOMException &&
    signal.reason.name === "TimeoutError"
      ? "timeout"
      : "aborted",
    operation,
  );
}
function wait<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  operation: string,
): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted(signal, operation));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(aborted(signal, operation));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(aborted(signal, "retry"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

/** No business writes, no configurable upstream origin, no redirects with bearer credentials. */
export class AgicapReadClient {
  #clientId: string;
  #clientSecret: string;
  #fetch: FetchTransport;
  #timeoutMs: number;
  #maxRetries: number;
  #maxResponseBytes: number;
  #now: () => number;
  #sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  #shutdown = new AbortController();
  #token?: { value: string; expiresAt: number };
  #pendingToken?: Promise<string>;

  constructor(options: AgicapClientOptions) {
    if (!options.clientId?.trim() || !options.clientSecret?.trim())
      throw new TypeError("API client ID and secret are required");
    this.#clientId = options.clientId;
    this.#clientSecret = options.clientSecret;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#maxResponseBytes = options.maxResponseBytes ?? 8 * 1024 * 1024;
    if (
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1 ||
      this.#timeoutMs > 120_000
    )
      throw new TypeError("timeoutMs must be 1–120000");
    if (
      !Number.isInteger(this.#maxRetries) ||
      this.#maxRetries < 0 ||
      this.#maxRetries > 3
    )
      throw new TypeError("maxRetries must be 0–3");
    if (
      !Number.isInteger(this.#maxResponseBytes) ||
      this.#maxResponseBytes < 1 ||
      this.#maxResponseBytes > 64 * 1024 * 1024
    )
      throw new TypeError("maxResponseBytes must be 1–67108864");
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? sleep;
  }

  dispose(): void {
    this.#shutdown.abort();
    this.#token = undefined;
    this.#clientId = "";
    this.#clientSecret = "";
  }

  async listOrganizations(
    options: PageOptions = {},
  ): Promise<Page<Organization>> {
    return this.#read(
      "organizations",
      "/public/organizations/v1",
      pageQuery(options),
      (value) => {
        const data = object(value);
        return {
          items: array(data.items, (item) => {
            const row = object(item);
            return { id: id(string(row.id)), name: string(row.name) };
          }),
          pagination: pagination(data.pagination),
        };
      },
      options.signal,
    );
  }

  async listEntities(
    organizationId: string,
    options: PageOptions = {},
  ): Promise<Page<Entity>> {
    return this.#read(
      "entities",
      `/public/organizations/v1/${id(organizationId)}/entities`,
      pageQuery(options),
      (value) => {
        const data = object(value);
        return {
          items: array(data.items, (item) => {
            const row = object(item);
            return {
              id: entityId(integer(row.id)),
              name: string(row.name),
              country: string(row.country),
            };
          }),
          pagination: pagination(data.pagination),
        };
      },
      options.signal,
    );
  }

  async listBankAccounts(
    organizationId: string,
    options: PageOptions = {},
  ): Promise<BankingPage<BankAccountMetadata>> {
    return this.#read(
      "bank_accounts",
      `/public/banking-documents/v1/organizations/${id(organizationId)}/bank-accounts`,
      pageQuery(options, true),
      (value) =>
        parseBankingPage(value, (item) => {
          const row = object(item);
          return {
            AccountNumber: string(row.AccountNumber),
            ConnectionId: id(string(row.ConnectionId)),
            CreatedAt: timestamp(string(row.CreatedAt)),
            EntityId: entityId(integer(row.EntityId)),
          };
        }),
      options.signal,
    );
  }

  async listBankConnections(
    selectedEntityId: number,
    options: PageOptions = {},
  ): Promise<BankingPage<BankConnectionMetadata>> {
    return this.#read(
      "bank_connections",
      `/public/banking-documents/v1/entities/${entityId(selectedEntityId)}/connections`,
      pageQuery(options, true),
      (value) =>
        parseBankingPage(value, (item) => {
          const row = object(item);
          return {
            Id: id(string(row.Id)),
            Name: string(row.Name),
            Type: string(row.Type),
          };
        }),
      options.signal,
    );
  }

  async listJournalExports(
    selectedEntityId: number,
    query: JournalQuery,
  ): Promise<JournalExportPage> {
    if ((query.after === undefined) === (query.before === undefined))
      throw new TypeError("Choose exactly one of after or before");
    const size = query.size ?? 100;
    if (!Number.isSafeInteger(size) || size < 1 || size > 1000)
      throw new TypeError("Journal size must be 1–1000");
    const params = new URLSearchParams({ size: String(size) });
    if (query.after !== undefined) params.set("after", timestamp(query.after));
    else params.set("before", timestamp(query.before!));
    return this.#read(
      "journal_exports",
      `/public/treasury-bank-journal/v1/entities/${entityId(selectedEntityId)}/exports`,
      params,
      (value) => {
        const body = object(value),
          cursor = object(body.cursor);
        return {
          items: array(body.items, (item) => {
            const row = object(item);
            return {
              exportId: id(string(row.exportId)),
              exportDateUtc: timestamp(string(row.exportDateUtc)),
              exportIndexInYear: integer(row.exportIndexInYear),
              exportYear: integer(row.exportYear),
              numberOfEntries: integer(row.numberOfEntries),
              indexInYearOfFirstEntryInBankJournal: integer(
                row.indexInYearOfFirstEntryInBankJournal,
              ),
              indexInYearOfLastEntryInBankJournal: integer(
                row.indexInYearOfLastEntryInBankJournal,
              ),
            };
          }),
          cursor: {
            size: integer(cursor.size),
            ...(cursor.after === undefined
              ? {}
              : {
                  after:
                    cursor.after === null
                      ? null
                      : timestamp(string(cursor.after)),
                }),
            ...(cursor.before === undefined
              ? {}
              : {
                  before:
                    cursor.before === null
                      ? null
                      : timestamp(string(cursor.before)),
                }),
          },
        };
      },
      query.signal,
    );
  }

  async getJournalExport(
    selectedEntityId: number,
    exportId: string,
    options: ReadOptions = {},
  ): Promise<JournalExport> {
    return this.#read(
      "journal_export",
      `/public/treasury-bank-journal/v1/entities/${entityId(selectedEntityId)}/exports/${id(exportId)}`,
      undefined,
      (value) => {
        const body = object(value);
        const result = {
          exportId: id(string(body.exportId)),
          entityName: string(body.entityName),
          year: integer(body.year),
          bankJournalExportIndexInYear: integer(
            body.bankJournalExportIndexInYear,
          ),
          entries: array(body.entries, (item) => {
            const row = object(item);
            return {
              ...row,
              agicapUniqueId: id(string(row.agicapUniqueId)),
              name: string(row.name),
              paymentDate: calendarDate(string(row.paymentDate)),
              originalCurrency: string(row.originalCurrency),
              accountingCurrency: string(row.accountingCurrency),
            };
          }),
        };
        if (result.exportId.toLowerCase() !== exportId.toLowerCase())
          throw new Error("export identity mismatch");
        return result;
      },
      options.signal,
    );
  }

  /** Probes existing GET endpoints; accessible does not imply write permission or complete subscription availability. */
  async getAccessibleFeatures(
    input: { organizationId: string; entityId: number; journalAfter: string },
    options: ReadOptions = {},
  ): Promise<AccessibleFeatures> {
    id(input.organizationId);
    entityId(input.entityId);
    timestamp(input.journalAfter);
    const probe = async (
      operation: () => Promise<unknown>,
    ): Promise<AccessProbe> => {
      try {
        await operation();
        return { state: "accessible" };
      } catch (error) {
        if (
          !(error instanceof AgicapError) ||
          error.code === "aborted" ||
          error.code === "disposed"
        )
          throw error;
        if (
          error.status === 401 ||
          error.status === 403 ||
          error.status === 404
        )
          return { state: "not_accessible", status: error.status };
        return {
          state: "unknown",
          errorCode: error.code,
          ...(error.status === undefined ? {} : { status: error.status }),
        };
      }
    };
    // Sequential requests avoid turning capability discovery into a burst of retries.
    return {
      organizations: await probe(() => this.listOrganizations(options)),
      entities: await probe(() =>
        this.listEntities(input.organizationId, options),
      ),
      bankAccounts: await probe(() =>
        this.listBankAccounts(input.organizationId, options),
      ),
      journalExports: await probe(() =>
        this.listJournalExports(input.entityId, {
          after: input.journalAfter,
          signal: options.signal,
        }),
      ),
    };
  }

  async #read<T>(
    operation: string,
    path: string,
    query: URLSearchParams | undefined,
    parse: (value: unknown) => T,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    if (this.#shutdown.signal.aborted)
      throw new AgicapError("disposed", operation);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, this.#shutdown.signal])
      : this.#shutdown.signal;
    let unauthorizedRetried = false;
    for (let retry = 0; ; ) {
      if (signal.aborted) throw aborted(signal, operation);
      const token = await this.#accessToken(signal);
      const response = await this.#attempt(
        operation,
        path,
        query,
        { method: "GET", headers: { Authorization: `Bearer ${token}` } },
        signal,
      );
      if (response.status === 401 && !unauthorizedRetried) {
        unauthorizedRetried = true;
        if (this.#token?.value === token) this.#token = undefined;
        continue;
      }
      if (
        (response.status === 429 || response.status === 503) &&
        retry < this.#maxRetries
      ) {
        // Agicap publishes a 60-second shared quota window and currently sends no retry headers.
        const delay =
          response.status === 429
            ? 60_000 + Math.floor(Math.random() * 1000)
            : Math.min(2000, 250 * 2 ** retry);
        retry++;
        await wait(this.#sleep(delay, signal), signal, operation);
        continue;
      }
      if (!response.ok)
        throw new AgicapError("http", operation, response.status);
      try {
        return parse(response.value);
      } catch {
        throw new AgicapError("malformed_response", operation);
      }
    }
  }

  async #accessToken(signal: AbortSignal): Promise<string> {
    if (this.#token && this.#token.expiresAt > this.#now())
      return this.#token.value;
    if (!this.#pendingToken) {
      const pending = this.#acquireToken();
      this.#pendingToken = pending;
      // Always observe rejection, including when all waiting callers abort.
      void pending.then(
        () => {
          if (this.#pendingToken === pending) this.#pendingToken = undefined;
        },
        () => {
          if (this.#pendingToken === pending) this.#pendingToken = undefined;
        },
      );
    }
    return wait(this.#pendingToken, signal, "authentication");
  }

  async #acquireToken(): Promise<string> {
    const requestedAt = this.#now();
    const response = await this.#attempt(
      "authentication",
      "/public/auth/v1/token",
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.#clientId,
          client_secret: this.#clientSecret,
          scope: "agicap:public-api",
        }),
      },
      this.#shutdown.signal,
    );
    if (this.#shutdown.signal.aborted)
      throw new AgicapError("disposed", "authentication");
    if (!response.ok)
      throw new AgicapError("http", "authentication", response.status);
    try {
      const body = object(response.value),
        token = string(body.access_token),
        seconds = integer(body.expires_in, 1);
      if (
        !token ||
        /[\r\n]/.test(token) ||
        string(body.token_type).toLowerCase() !== "bearer" ||
        seconds > 86_400
      )
        throw new Error("invalid token");
      const lifetime = seconds * 1000;
      this.#token = {
        value: token,
        expiresAt: requestedAt + lifetime - Math.min(30_000, lifetime / 10),
      };
      return token;
    } catch {
      throw new AgicapError("malformed_response", "authentication");
    }
  }

  async #attempt(
    operation: string,
    path: string,
    query: URLSearchParams | undefined,
    init: RequestInit,
    callerSignal: AbortSignal,
  ): Promise<{ ok: boolean; status: number; value?: unknown }> {
    const deadline = new AbortController();
    const timer = setTimeout(
      () =>
        deadline.abort(new DOMException("Deadline reached", "TimeoutError")),
      this.#timeoutMs,
    );
    const signal = AbortSignal.any([callerSignal, deadline.signal]);
    let response: Response | undefined;
    try {
      const url = new URL(path, ORIGIN);
      if (query) url.search = query.toString();
      response = await wait(
        this.#fetch(url, {
          ...init,
          headers: {
            Accept: "application/json",
            "User-Agent": "OpenTesoro-Agicap/0.1",
            ...init.headers,
          },
          redirect: "error",
          credentials: "omit",
          signal,
        }),
        signal,
        operation,
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return { ok: false, status: response.status };
      }
      const length = response.headers.get("content-length");
      if (length !== null && Number(length) > this.#maxResponseBytes)
        throw new AgicapError("malformed_response", operation);
      const reader = response.body?.getReader();
      if (!reader) throw new AgicapError("malformed_response", operation);
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const next = await wait(reader.read(), signal, operation);
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > this.#maxResponseBytes)
            throw new AgicapError("malformed_response", operation);
          chunks.push(next.value);
        }
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let value: unknown;
      try {
        value = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(joined),
        );
      } catch {
        throw new AgicapError("malformed_response", operation);
      }
      return { ok: true, status: response.status, value };
    } catch (error) {
      if (signal.aborted) throw aborted(signal, operation);
      if (error instanceof AgicapError) throw error;
      throw new AgicapError("transport", operation);
    } finally {
      clearTimeout(timer);
      // Covers refused headers before a body reader was obtained.
      if (response?.body && !response.body.locked)
        void response.body.cancel().catch(() => undefined);
    }
  }
}
