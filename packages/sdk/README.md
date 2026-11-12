# @opentesoro/sdk

Fetch-only TypeScript client for the OpenTesoro v1 HTTP API. No runtime dependency beyond standard Fetch; shared engine imports are types only. The package currently exports TypeScript source as a local workspace package.

```ts
import { OpenTesoroClient, ApiError } from "@opentesoro/sdk";

const client = new OpenTesoroClient({
  baseUrl: "http://127.0.0.1:3000",
  token: process.env.OPENTESORO_API_TOKEN,
});

const page = await client.list("transactions", {
  entityId: "tour-operator",
  limit: 100,
  offset: 0,
  direction: "inflow",
});
const forecast = await client.forecast({
  from: "2026-11-01",
  to: "2027-04-30",
  granularity: "week",
});
```

Use `bootstrap`, `list`, `get`, `create`, `update`, `remove`, `forecast`, `previewImport`, `commitImport` and `reconcile`. `create` accepts an optional third argument for an idempotency key; reusing that key with a changed request yields HTTP 409. `request<T>` exposes additional documented workflow endpoints. IDs are URL-encoded once, including generated booking installment IDs.

Money fields are signed safe-integer minor units. EUR amounts use two digits; `123456` means EUR 1,234.56. Obligation `settledMinor` and reconciliation allocation amounts are absolute nonnegative/positive cents. Dates are ISO calendar dates. See the [engine contract](../engine/README.md).

`ApiError` includes `status`, `detail` and optional `requestId`. Network and AbortSignal failures propagate as transport failures. Read methods accept AbortSignal; generic `request` accepts any standard RequestInit. The client does not retry financial writes automatically. Handle identity, credentials, retry and cache policies in the embedding application.

Lists return `{items,total,limit,offset}`. Bootstrap includes at most 5,000 transactions and reports `transactionsTotal`; use pagination for complete history and server dashboard for canonical balances. JSON export is a whole-installation interchange export, not a database backup or entity-isolated endpoint.

The injected `fetch` option supports testing and framework integration. The integration suite runs this exact client against the real Bun request handler and a temporary SQLite store, including reopen persistence, partial settlement, idempotency, filters, and reader/writer boundaries.
