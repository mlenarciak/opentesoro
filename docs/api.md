# OpenTesoro API

The standalone API uses `/api/v1`. `GET /health` and `GET /openapi.json` are outside that prefix. Resource schemas in the OpenAPI document are generated from the server's Zod schemas; workflow responses currently use broad object schemas. Cross-record constraints and refinements are enforced by server code and tests, so generated JSON Schema is not a complete specification of every business rule.

All examples use synthetic data. The API is one installation/organization; an `entityId` filter is a reporting scope, **not** an authorization boundary.

## Authentication, requests and errors

Without a configured token, a loopback installation trusts callers that can reach it. When `OPENTESORO_API_TOKEN` is configured, all `/api/*` routes require `Authorization: Bearer …`. A distinct `OPENTESORO_READ_ONLY_TOKEN` permits GET/HEAD methods only; even CSV preview uses POST and is refused for a read-only token. See [operations](operations.md) before hosting beyond loopback.

Mutations use `Content-Type: application/json`, except DELETE. The HTTP body limit is 2,500,000 bytes. Mutation requests with an unexpected browser Origin or cross-site fetch metadata are refused. `ALLOWED_ORIGINS` configures mutation admission, not general CORS support.

Errors use `application/problem+json` and include `type`, `title`, `status`, `detail` and `requestId`. Common outcomes: 400 malformed JSON, 401 missing/invalid bearer, 403 insufficient method/origin authority, 404 missing record, 409 duplicate/conflicting/financially immutable record, 413 oversized request, 415 wrong content type, 422 invalid input. Keep the request ID when reporting an unexpected 500.

## Resource routes

Collections: `entities`, `accounts`, `categories`, `transactions`, `obligations`, `scenarios`, `bookings`, `rules`, `settlements`.

| Method/path                        | Behavior                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/{collection}`         | Paginated collection                                                                                               |
| `GET /api/v1/{collection}/{id}`    | One record                                                                                                         |
| `POST /api/v1/{collection}`        | Create, except settlements; omitted ID is generated                                                                |
| `PATCH /api/v1/{collection}/{id}`  | Merge validated fields into the existing record, except settlements                                                |
| `DELETE /api/v1/{collection}/{id}` | Delete an unreferenced mutable record; bookings are canceled through PATCH, settlements cannot be directly deleted |

List queries accept `limit` (default 100, 1–1,000), `offset` (default 0, at most 1,000,000), `entityId`, `accountId`, `categoryId`, `status`, `search`, and `direction=inflow|outflow`. Use `categoryId=uncategorized` for transactions without a category. Only meaningful fields match a given collection; for example categories have no entity scope. Search checks description, counterparty and name. Transactions sort newest first, other dated resources oldest first. Response:

```json
{ "items": [], "total": 0, "limit": 100, "offset": 0 }
```

Create/PATCH accept `Idempotency-Key`. Replaying the same key and same request returns the stored result; reuse for a different method/path/body conflicts. Keys are installation-wide. This mechanism does not apply to every workflow POST. Reconciliation requires callers to manage ambiguous transport failures by inspecting resulting settlements rather than blindly retrying.

## Minimal setup

Signed integer minor units and ISO `YYYY-MM-DD` dates are required. New account/entity currency is EUR; no implicit FX conversion is performed.

```sh
curl -X POST http://127.0.0.1:3000/api/v1/entities \
  -H 'Content-Type: application/json' \
  -d '{"id":"operator-example","name":"Operatore dimostrativo","currency":"EUR"}'

curl -X POST http://127.0.0.1:3000/api/v1/accounts \
  -H 'Content-Type: application/json' \
  -d '{"id":"operating-example","entityId":"operator-example","name":"Conto operativo","bank":"Banca dimostrativa","currency":"EUR","balanceMinor":5000000,"asOfDate":"2026-11-30","enabled":true}'
```

For a protected installation add `-H "Authorization: Bearer $OPENTESORO_API_TOKEN"` using a secret already injected into your local environment. Never paste real credentials into example files.

## Cash position and forecasts

`GET /api/v1/bootstrap` returns app configuration, entities/accounts/categories/obligations/scenarios/bookings/rules/settlements, up to 5,000 transactions and `transactionsTotal`. Optional `entityId` scopes entity-owned operating records; shared catalogs remain shared. Do not use bootstrap as a complete transaction export or tenant-isolation mechanism.

`GET /api/v1/dashboard?entityId=...` returns cash balances, aging, account counts and uncategorized counts. Its as-of date is installation metadata for the synthetic demo, otherwise the current date. Aging reflects current outstanding obligations. There is no arbitrary historical settlement reconstruction.

`GET /api/v1/forecast` accepts `from`, `to`, `granularity=day|week|month`, optional `scenarioId` and `entityId`. Always send an explicit date range in an integration: the initial server defaults are 2026-11-01 through 2027-04-30 for the demo. The engine requires `from` to be after every included account's closing snapshot. Transactions after snapshots and before `from` bridge the opening balance. The range is inclusive and bounded to 3,661 calendar dates.

```sh
curl 'http://127.0.0.1:3000/api/v1/forecast?from=2026-12-01&to=2027-02-28&granularity=week&entityId=operator-example'
```

Response includes currency, opening/closing balances, total inflow/outflow, daily minimum balance/date, category aggregates, warnings and periods. Each period separates actual/expected inflow/outflow and its opening/closing balances. Outflow totals are positive magnitudes; underlying transaction/obligation payments are negative. Overdue residual obligations move to the first forecast day with a visible warning. A scenario changes only expected amounts/timing. Minimum liquidity is computed from daily values even when weekly/monthly periods are requested.

The reusable engine additionally accepts account scope and minimum-buffer inputs that are not yet exposed as HTTP query parameters. Recurrence and category-budget variance are engine-level capabilities; there is no corresponding complete persisted budget/snapshot API yet.

## Receivables, payables and reconciliation

An obligation has signed `amountMinor`, absolute nonnegative `settledMinor`, due date, entity, optional account/category/booking reference and status. `open`, `partial` and `settled` must agree with the settled amount; `cancelled` is separately recognized. New obligations must start with zero settlement. Direct PATCH cannot increase settlement amounts; use reconciliation.

`GET /api/v1/reconciliation/suggestions?transactionId=...` returns ranked candidates and explanations without changing data.

`POST /api/v1/reconciliation` accepts:

```json
{
  "transactionId": "receipt-example",
  "obligationId": "deposit-example",
  "amountMinor": 60000
}
```

The allocation is positive absolute money. The bank transaction and obligation must have compatible entity/account/direction, transfers cannot be matched to trading obligations, and allocation cannot exceed the remaining transaction or obligation amount. The API atomically persists the settlement and updated obligation. This supports partial allocations across multiple obligations; it is not an automatic payment command. Financial fields of reconciled transactions and partly settled obligations are guarded against later edits.

## Booking schedules and scenarios

Creating a booking creates its deposit/balance and configured supplier obligations atomically. Stable generated identities prevent repeated generation from creating duplicate installments. An unpaid booking can be updated and its schedule replaced; a booking with payments refuses schedule-changing edits. Cancel with `PATCH /bookings/{id}` and `{"status":"cancelled"}` only when permitted by those guards. A paid cancellation/refund workflow is not yet implemented; do not erase actual payments to imitate a refund.

Scenario amounts use basis points as total multipliers: `10000` is 100%, `9000` is 90%. The API permits 0–100,000 basis points and delays −365 to +365 days. These API bounds are narrower than some reusable engine bounds. A scenario is an assumption and does not change the source records.

## Categorization and CSV interchange

`POST /api/v1/rules/apply` applies enabled prioritized substring rules to uncategorized non-transfer transactions. It does not overwrite an existing category. Create rules through the collection endpoint; rule direction and category cash direction must agree with resulting assignments.

`POST /api/v1/import/preview` accepts `{"csv":"..."}` and returns parsed rows, row errors, delimiter and total count. It writes nothing.

`POST /api/v1/import/commit` accepts `{"csv":"...","accountId":"..."}`. Invalid rows reject the entire batch. The selected account supplies the entity. Already-imported external IDs on that account are counted as duplicates. Response includes `imported`, `duplicates`, `totalRows`.

```csv
date;description;counterparty;amount;externalId
2026-12-02;Acconto viaggio dimostrativo;Cliente esempio;1250,00;booking-demo-1-deposit
2026-12-03;Acconto hotel dimostrativo;Hotel esempio;-850,50;supplier-demo-1
```

CSV accepts comma/semicolon delimiters, Italian header aliases, ISO or `DD/MM/YYYY` dates and canonical/Italian two-decimal amounts. The limit is 2 MiB and 10,000 rows. Stable upstream references are preferable to generated fallback hashes: fallback identity includes content and the occurrence count of equal rows, so a changed source line can become a new transaction. This is a normalized transaction importer, not a complete CBI/CAMT/MT940 parser.

`GET /api/v1/export?format=csv` exports transactions as semicolon CSV with integer-cent `amountMinor`, not the decimal `amount` column of the importer. It is an analysis export, not a promised round-trip import file. Optional `entityId` scopes CSV. `format=json` produces a **whole-installation** record export; entity filtering does not reduce it. JSON record export is not a replacement for a complete SQLite backup of audit, metadata and idempotency state. `GET /api/v1/audit` returns the latest 100 audit summaries.

## SDK and supported integrations

```ts
import { OpenTesoroClient } from "@opentesoro/sdk";
const treasury = new OpenTesoroClient({ baseUrl: "http://127.0.0.1:3000" });
const page = await treasury.list("transactions", {
  limit: 100,
  offset: 0,
  search: "hotel",
});
const forecast = await treasury.forecast({
  from: "2026-12-01",
  to: "2027-02-28",
  granularity: "week",
});
```

The SDK supports fetch injection, optional bearer token, typed resources, CRUD, forecast, CSV preview/commit and reconciliation. Additional workflows can use its `request<T>()` method. The separately documented [Agicap client](../packages/agicap/README.md) reads a limited subset of official current Public API endpoints; it is not automatically connected by the OpenTesoro server and does not claim full Agicap migration.
