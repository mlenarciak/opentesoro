import type {
  Account,
  Entity,
  Category,
  Transaction,
  Obligation,
  Scenario,
  Forecast,
  Settlement,
} from "@opentesoro/engine";
export type {
  Account,
  Entity,
  Category,
  Transaction,
  Obligation,
  Scenario,
  Forecast,
  Settlement,
};
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface Booking {
  id: string;
  entityId: string;
  accountId: string;
  reference: string;
  customer: string;
  destination: string;
  bookingDate: string;
  departureDate: string;
  returnDate: string;
  totalMinor: number;
  depositBasisPoints: number;
  balanceDaysBefore: number;
  supplierName: string;
  supplierCostMinor: number;
  supplierDepositBasisPoints: number;
  supplierBalanceDaysBefore: number;
  status: "confirmed" | "cancelled";
}
export interface Rule {
  id: string;
  name: string;
  categoryId: string;
  priority: number;
  contains: string;
  direction: "inflow" | "outflow" | "both";
  enabled: boolean;
}
export interface Bootstrap {
  version: string;
  asOfDate: string;
  demo: boolean;
  revision: number;
  entities: Entity[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transactionsTotal: number;
  obligations: Obligation[];
  scenarios: Scenario[];
  bookings: Booking[];
  rules: Rule[];
  settlements: Settlement[];
}
export interface Resources {
  entities: Entity;
  accounts: Account;
  categories: Category;
  transactions: Transaction;
  obligations: Obligation;
  scenarios: Scenario;
  bookings: Booking;
  rules: Rule;
  settlements: Settlement;
}
export interface ImportPreview {
  rows: {
    row: number;
    date: string;
    description: string;
    counterparty: string;
    amountMinor: number;
    externalId: string;
  }[];
  errors: { row: number; message: string }[];
  totalRows: number;
  delimiter: string;
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly requestId?: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}
/** Fetch-only SDK works in Bun, Node, browsers, Workers, and embedded applications. */
export class OpenTesoroClient {
  private readonly baseUrl: string;
  constructor(
    private readonly options: {
      baseUrl?: string;
      token?: string;
      fetch?: typeof fetch;
    } = {},
  ) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:3000").replace(
      /\/$/,
      "",
    );
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (this.options.token)
      headers.set("authorization", `Bearer ${this.options.token}`);
    const response = await (this.options.fetch ?? fetch)(
      `${this.baseUrl}/api/v1${path}`,
      { ...init, headers },
    );
    if (!response.ok) {
      const p = (await response
        .json()
        .catch(() => ({ detail: response.statusText }))) as {
        detail?: string;
        requestId?: string;
      };
      throw new ApiError(
        response.status,
        p.detail ?? response.statusText,
        p.requestId,
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  bootstrap(signal?: AbortSignal) {
    return this.request<Bootstrap>("/bootstrap", { signal });
  }
  list<K extends keyof Resources>(
    kind: K,
    query: Record<string, string | number | undefined> = {},
    signal?: AbortSignal,
  ) {
    return this.request<Page<Resources[K]>>(`/${kind}?${params(query)}`, {
      signal,
    });
  }
  get<K extends keyof Resources>(kind: K, id: string, signal?: AbortSignal) {
    return this.request<Resources[K]>(`/${kind}/${encodeURIComponent(id)}`, {
      signal,
    });
  }
  create<K extends Exclude<keyof Resources, "settlements">>(
    kind: K,
    body: Omit<Resources[K], "id"> & { id?: string },
    idempotencyKey?: string,
  ) {
    return this.request<Resources[K]>(`/${kind}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
    });
  }
  update<K extends Exclude<keyof Resources, "settlements">>(
    kind: K,
    id: string,
    patch: Partial<Omit<Resources[K], "id">>,
  ) {
    return this.request<Resources[K]>(`/${kind}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }
  remove<K extends Exclude<keyof Resources, "settlements" | "bookings">>(
    kind: K,
    id: string,
  ) {
    return this.request<void>(`/${kind}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
  forecast(
    query: {
      from: string;
      to: string;
      granularity?: "day" | "week" | "month";
      scenarioId?: string;
      entityId?: string;
    },
    signal?: AbortSignal,
  ) {
    return this.request<Forecast>(`/forecast?${params(query)}`, { signal });
  }
  previewImport(csv: string) {
    return this.request<ImportPreview>("/import/preview", {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
  }
  commitImport(csv: string, accountId: string) {
    return this.request<{
      imported: number;
      duplicates: number;
      totalRows: number;
    }>("/import/commit", {
      method: "POST",
      body: JSON.stringify({ csv, accountId }),
    });
  }
  reconcile(body: {
    transactionId: string;
    obligationId: string;
    amountMinor: number;
  }) {
    return this.request<{ obligation: Obligation; settlement: Settlement }>(
      "/reconciliation",
      { method: "POST", body: JSON.stringify(body) },
    );
  }
}
function params(values: Record<string, string | number | undefined>): string {
  return new URLSearchParams(
    Object.entries(values).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, String(v)]],
    ),
  ).toString();
}
