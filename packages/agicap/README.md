# @opentesoro/agicap

A dependency-free, server-side TypeScript client for a small **read-only** subset of Agicap's current Public API. It is useful for sanctioned metadata discovery and reading existing journal exports. It does not use private web-application endpoints, web-session cookies or the deprecated API.

The package exports TypeScript source, so use a TypeScript-aware runtime/bundler such as Bun. It is a workspace package, not an assertion of a published npm release.

## Use

```ts
import { AgicapReadClient } from "@opentesoro/agicap";

// Read from a server-side secret manager/environment, never browser code.
const client = new AgicapReadClient({
  clientId: process.env.AGICAP_CLIENT_ID!,
  clientSecret: process.env.AGICAP_CLIENT_SECRET!,
});

try {
  const organizations = await client.listOrganizations({ pageSize: 100 });
  const organization = organizations.items[0];
  if (!organization) throw new Error("No organization returned");

  const entities = await client.listEntities(organization.id);
  const accounts = await client.listBankAccounts(organization.id);
  // Metadata only: the account-list route does not establish current balances.
  console.log({
    entityCount: entities.items.length,
    accountCount: accounts.Items?.length ?? 0,
  });
} finally {
  client.dispose();
}
```

Create suitable Public API client credentials through Agicap's supported settings workflow. A login email/password is not an API credential. The organization must have the relevant API products enabled. This client requests only the base scope `agicap:public-api`; it cannot import payments or change beneficiaries/suppliers.

Do not commit secrets, inject them into frontend bundles, or save them in import fixtures. The client does not log credentials or include upstream response bodies/raw transport errors in exceptions. Results can contain private company and banking information: the caller still controls their storage and disclosure.

## Supported reads

| Method                                                                        | Behavior                                                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `listOrganizations(options?)`                                                 | One page of organizations and pagination metadata                                                         |
| `listEntities(organizationId, options?)`                                      | One page of entities, including country                                                                   |
| `listBankAccounts(organizationId, options?)`                                  | Banking account metadata in its PascalCase wire shape                                                     |
| `listBankConnections(entityId, options?)`                                     | Existing Banking Documents connections                                                                    |
| `listJournalExports(entityId, query)`                                         | One cursor page of existing export summaries; requires exactly one explicit `after` or `before` timestamp |
| `getJournalExport(entityId, exportId, options?)`                              | Previously generated journal export; never generates an export                                            |
| `getAccessibleFeatures({ organizationId, entityId, journalAfter }, options?)` | Sequential probes of four existing GET endpoints                                                          |
| `dispose()`                                                                   | Cancels outstanding work, clears cached credentials/token and prevents reuse                              |

`getAccessibleFeatures` returns `accessible`, `not_accessible`, or `unknown` per probe. A successful empty page is accessible. A denied response is not a declaration that a subscription module is absent: missing/expired credentials, organization selection and permissions can also cause denial. Temporary failures remain unknown. This is not a comprehensive list of Agicap entitlements.

Pagination is explicit: methods do not silently fetch every page. Page options use 1-based pages and an adapter cap of 100 items; journal pages are capped at 1,000 by this adapter. These conservative client bounds should not be interpreted as universal Agicap product limits. Banking responses retain `Items` / `Pagination`; other APIs use their own casing. Journal amounts can have four decimal places and are retained as raw unknown fields rather than rounded into cents. Apply a deliberate, tested normalization before using those values in the OpenTesoro engine.

## Network and lifecycle policy

All requests target `https://api.agicap.com`. The origin cannot be overridden, paths are selected internally, redirects are refused, and cookies are omitted. An injected `fetch` is intended for tests or an explicitly trusted transport adapter; its implementation is trusted with API credentials.

Only the OAuth token exchange uses POST. There are no business-write methods. Tokens are cached until shortly before their declared expiration; simultaneous reads share an exchange. An individual caller's cancellation stops its wait but does not terminate a shared token exchange needed by other readers. That exchange has its own fixed deadline; `dispose()` cancels it for everyone.

Each attempt defaults to a 15-second deadline including body consumption, and a maximum 8 MiB JSON response. `timeoutMs` permits 1–120,000; `maxResponseBytes` permits 1–67,108,864. Unknown or malformed successful responses fail closed.

GET requests retry 429 and 503 responses at most twice by default (`maxRetries`: 0–3). A 429 waits 60–61 seconds because the current official guide describes a shared minute quota with no retry headers. A 503 uses short exponential delays. Token exchanges and generic network errors are not automatically retried. A GET 401 refreshes the token once; a 403 is surfaced immediately because it can indicate product/permission/organization problems. Use `AbortSignal` to impose a total job deadline across retries:

```ts
await client.listEntities(organizationId, {
  signal: AbortSignal.timeout(90_000),
});
```

This package does not coordinate rate quotas across processes or credentials. Bulk callers must pace jobs against the organization-wide quota. Its injectable clock/sleep/fetch options enable deterministic tests; production callers should use defaults unless they supply equivalent cancellation behavior.

## Errors

`AgicapError` exposes `code`, `operation` and optional HTTP `status`. Codes: `http`, `transport`, `malformed_response`, `timeout`, `aborted`, `disposed`. Invalid caller arguments throw `TypeError` before network access. Error objects intentionally omit response bodies, request headers, credentials and raw exception text.

## Limits and verification

This is **not** a complete Agicap migration adapter. Banking Documents excludes export of PSD2/Open Banking-derived bank data. Journal exports describe a pre-accounting workflow, not a universal bank transaction feed; generating a new export would change workflow state and is intentionally absent. Business Documents read-back can differ from subsequently edited application data. There is no claim of private forecast/scenario API support, complete customer data extraction, or bank connectivity.

Run `bun test packages/agicap` from the repository root. The contract/lifecycle suite uses synthetic, injected HTTP responses. No real credentials or authenticated calls were used to verify this package. Production enablement requires credentials, eligible products and comparison with agreed source totals.

References checked 2026-11-12: [authentication](https://api.agicap.com/guides/authentication), [organizations](https://api.agicap.com/api-details/organizations-v1), [banking documents](https://api.agicap.com/api-details/banking-documents-v1), [journal exports](https://api.agicap.com/api-details/treasury-bank-journal-v1), [rate limiting](https://api.agicap.com/guides/rate_limiting). See [research notes](../../docs/research/current-api.md) for broader API boundaries and the recorded public schema inventory.
