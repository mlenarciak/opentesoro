# Agicap current public API: integration notes

Checked **2026-11-12** against the official [developer portal](https://api.agicap.com/), [catalog](https://api.agicap.com/apis), and public OpenAPI schemas. This file documents researched contracts. It does not claim that OpenTesoro has a production connector or that authenticated calls were tested.

## Authentication and authority

Production base: `https://api.agicap.com`. Do not use `api.agicap.internal`, which also appears in some schemas. Current token exchange is `POST /public/auth/v1/token`, form-encoded, using `grant_type=client_credentials`, client ID, client secret, and base scope `agicap:public-api`. Response fields include `access_token`, `expires_in`, `scope`, and `token_type`. Cache the token and use its actual expiry; the current guide describes up to one hour. Credentials come from API settings, not the account's email/password.

API clients belong to an organization and cover all its entities; they cannot be limited to an individual entity. Optional permissions include payment-file import, signed-beneficiary import, beneficiary management and supplier management. Select only needed permissions. A UI login is insufficient to establish API access. [Authentication guide](https://api.agicap.com/guides/authentication), [token reference](https://api.agicap.com/api-details/auth-v1).

The [quickstart](https://api.agicap.com/guides/quickstart) requires an account with Public API access and permission to manage API settings. `GET /public/httpbin/v1/get` is its non-business test endpoint. Organization discovery uses `GET /public/organizations/v1`; entity discovery uses `GET /public/organizations/v1/{organizationId}/entities`. Creating credentials changes account configuration and was not part of this research.

## Verified documentation paths

These paths were read from the current published schemas. Placeholders identify caller-selected resources; this table is not an instruction to execute writes.

| Product                  | Relevant route and behavior                                                                                                                      | Integration consequence                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Organization v1          | `GET /public/organizations/v1`; `GET /public/organizations/v1/{organizationId}/entities`                                                         | UUID organization IDs, ordinarily integer entity IDs; page size 2–100 in this schema                |
| Banking Documents v1     | `GET /public/banking-documents/v1/organizations/{organizationId}/bank-accounts`; entity connection, account-report, file and statement resources | Bank-file exchange; not an API for exporting PSD2-fed transactions                                  |
| Business Documents v2    | `/public/business-documents/v2/entities/{entityid}/connections/{connectionid}/{document-kind}`                                                   | Connection-scoped client/supplier invoices, credit notes, orders, quotes, proformas, delivery notes |
| Treasury Bank Journal v1 | `GET /public/treasury-bank-journal/v1/entities/{entityId}/exports`; `GET` and `POST .../exports/{exportId}`                                      | Reading an existing export differs from generating an export, which records workflow state          |
| Payments v2              | `/public/payments/v2/entities/{entityId}/Beneficiaries`; `.../Beneficiaries/sync`; `.../payments-files/import`; `.../remittances/import`         | Beneficiary directory and payment preparation/import are separate from cash forecasting             |
| Suppliers v1             | `GET /public/suppliers/v1/entities/{entityId}`; `POST .../sync`; `GET .../sync/{syncId}`                                                         | Read list vs synchronizing a complete supplier directory                                            |
| Clients AR v1            | `/public/ar-clients/v1/entities/{entityId}/clients`, client addresses, internal/external contacts                                                | Customer master-data integration, not a general receivable ledger                                   |
| Client Risk v1           | `/public/client-risk/v1/entities/{entityId}/credit-limits`                                                                                       | Credit-limit metadata; distinct from invoice balances                                               |
| Purchase-to-Pay v2       | `/public/invoices-management/v2/entities/{entityId}/inbox/documents`, `/invoices/not-verified`, invoice and purchase-order operations            | Invoice-document verification workflow; v2 distinguishes supplier from beneficiary                  |
| Webhooks v1              | `/public/events/v1/webhooks`, `/{id}`, enable/disable, send-example                                                                              | Configured notification delivery; current event list is narrower than all platform changes          |

References: [Organization](https://api.agicap.com/api-details/organizations-v1), [Banking Documents](https://api.agicap.com/api-details/banking-documents-v1), [Business Documents v2](https://api.agicap.com/api-details/business-documents-v2), [Treasury Bank Journal](https://api.agicap.com/api-details/treasury-bank-journal-v1), [Payments](https://api.agicap.com/api-details/payments-v2), [Suppliers](https://api.agicap.com/api-details/suppliers-v1), [Clients AR](https://api.agicap.com/api-details/ar-clients-v1), [Client Risk](https://api.agicap.com/api-details/client-risk-v1), [Purchase-to-Pay](https://api.agicap.com/api-details/invoices-management-v2), [Webhooks](https://api.agicap.com/api-details/events-v1).

The catalog additionally advertises card-expense journal, purchase journal, chart of accounts, electronic invoicing, intragroup financing, Authentication and Tests contracts. Different products have stable, beta or preview lifecycle labels; check the chosen version before development. [Catalog](https://api.agicap.com/apis).

## Business-document semantics

Documents require an entity-owned connection. New connections need Agicap-side activation; the API client's credentials and a document connection are different resources. Treasury, AP and AR routing depends on the organization's enabled modules and Agicap configuration. Most importantly, document GET returns what the integration pushed, not necessarily the document as subsequently edited in Agicap. It is not a universal authoritative read-back of payment state. Model source provenance and synchronization direction explicitly. [Business Documents guide](https://api.agicap.com/guides/business_documents).

Invoice and credit-note routes in v2 expose `pagesize`, `pageindex` starting at 1, `externalids`, `updatedsince`, and status filters. `updatedsince` means strictly after the watermark. Use overlapping incremental windows and stable-ID deduplication where clock resolution or concurrent updates could otherwise lose records. Preserve source datetime offsets. Inspect installment amounts and due dates rather than reducing an invoice to one cash date. [v2 contract](https://api.agicap.com/api-details/business-documents-v2).

## Pagination, rate limits and failures

Agicap uses page, offset and cursor styles; do not impose one generic paginator. General page guidance starts at 1, while particular products may override it. Journal export listing uses `before` or `after` with `size`. Banking responses can use PascalCase while other products use camelCase. Preserve each wire contract. [Pagination](https://api.agicap.com/guides/pagination).

Current authentication limits: **10 calls/second and 60/minute per caller IP**, evaluated together. Authenticated products share **250 calls/minute per organization**, including traffic through different credentials. The guide says the gateway currently sends no `Retry-After` or quota headers. Cache tokens, pace bulk jobs, and use minute-window backoff with jitter after throttling; coordinate workers instead of multiplying credentials. [Rate limiting](https://api.agicap.com/guides/rate_limiting).

Gateway authentication failures can be **403**, while a service may return **401**. A 403 may also indicate wrong organization, missing scope, inactive product/connection or required functional permission. Refreshing a token indefinitely will not fix those. Handle malformed input (400), missing resource (404), conflicts (409), throttling (429), and bounded transient retries for 5xx. The current guide also describes edge rejection `error code: 1010`; use an identifiable User-Agent. [Errors](https://api.agicap.com/guides/errors).

Dates are ISO calendar dates; datetimes must include an offset. IDs vary: organization UUID, entity integer generally, but Business Documents and Intragroup Financing declare entity IDs as strings. No universal cross-product idempotency header exists. In particular, replaying Business Document creation for an existing external ID conflicts; other POSTs may duplicate effects. A timeout does not prove a write failed. [Data types and replays](https://api.agicap.com/guides/data_types).

## Dangerous assumptions to avoid

**Supplier synchronization is a full snapshot.** Previously synced suppliers absent from a new payload are deleted; it is not a delta upsert. Read and inspect the per-item report. Manual suppliers have different ownership semantics. Keep this operation out of read-only migration code. [Supplier guide](https://api.agicap.com/guides/suppliers).

**Supplier and beneficiary are different concepts.** The former is the commercial party; the latter is a payment bank account. Link explicitly through supplier ERP identity, and do not silently pick a bank account when there are multiple candidates. [Beneficiaries](https://api.agicap.com/guides/beneficiaries).

**Journal export generation mutates export state.** Its GET endpoint can retrieve a previous export; the POST produces one with a caller-provided export ID. Do not run POST merely to inspect data. Current schema paths use `/public/`; some prose still says `/public-api/`, so prioritize the selected live OpenAPI contract and validate safely. [Journal reference](https://api.agicap.com/api-details/treasury-bank-journal-v1).

**Webhooks do not imply every object has events.** The guide currently lists `bank_journal.export_triggered`. It specifies Standard Webhooks signatures, timestamp freshness, stable event IDs and at-least-once delivery; require durable deduplication. Enablement and HTTPS endpoint registration are writes and were not performed. [Webhook guide](https://api.agicap.com/guides/webhooks).

## OpenTesoro adapter requirements

Build a server-side adapter with injected credentials, token cache, descriptive User-Agent, bounded retries, product-specific pagination and wire validation. Keep web-session cookies out of it. First scope: documentation discovery and read-only organization/entity/connection/file metadata; optional imports must preserve external identity and show a preview. Never promise complete Agicap migration through APIs that expose only originally pushed documents or eligible bank files.

A production connector still requires suitable credentials, activated products, representative fixtures, contract tests and reconciliation against agreed source totals. The local engine, API and UI should work independently of this connector.

The old [openapi.agicap.com reference](https://openapi.agicap.com/docs/index.html) explicitly marks its API deprecated and directs developers to the current portal. Do not revive its old token, CompanyId, connection/account or expected-transaction routes in a new integration.
