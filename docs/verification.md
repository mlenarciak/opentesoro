# Verification ledger

Recorded on **2026-11-12**, OpenTesoro **0.1.0**, Bun **1.3.13**, Linux x64. All business fixtures are synthetic. These checks establish a tested first milestone, not full Agicap parity or production certification.

## Executed release checks

| Check                                                                    | Result                                             | Scope                                                                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                          | Passed                                             | Locked workspace installation                                                                                                                        |
| `bun run typecheck`                                                      | Passed                                             | Strict TypeScript for apps, packages, scripts and browser tests                                                                                      |
| `bun test`                                                               | **140 passed, 0 failed, 496 assertions, 8 files**  | Engine, persistence/API, search/migration, SDK, connector and UI money/date boundaries                                                               |
| `bun run build`                                                          | Passed                                             | Vite client and bundled Bun server artifacts produced                                                                                                |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome bun run test:e2e` | **8 passed**                                       | Real browser against standalone Bun servers with isolated temporary SQLite databases                                                                 |
| Built server over HTTP                                                   | Passed                                             | Compiled server artifact, schema version 4 health, client deep link and JavaScript asset returned 200                                                |
| Real HTTP bearer boundary                                                | Passed                                             | Anonymous bootstrap 401; reader GET 200; reader write 403; writer create 201                                                                         |
| SQLite restart/persistence                                               | Passed                                             | SDK suite closes/reopens on-disk database and checks settlements, revision and unchanged forecast                                                    |
| `bun run verify:backup`                                                  | Passed                                             | Online SQLite backup with source open in WAL mode; integrity `ok`; restored financial projection, revision and audit match                           |
| OpenAPI 3.1 validation                                                   | Passed, zero warnings                              | Redocly CLI `lint --extends minimal`; input defaults and null category clearing represented                                                          |
| Workflow output contracts                                                | Passed                                             | Actual bootstrap, dashboard, forecast, preview and reconciliation-candidate results validate against documented Zod contracts                        |
| `bun audit --json`                                                       | Passed, empty advisory result                      | Dependency advisories at check time; not an independent security audit                                                                               |
| Official Agicap public API inventory                                     | 19 versioned contracts / 251 documented operations | Read-only public schemas, source URLs and hashes retained in research inventory                                                                      |
| Authorized Agicap UI inspection                                          | Successful, read-only                              | Trial/no active subscription and restricted treasury access; no business modifications                                                               |
| Container build/run                                                      | **Not executed**                                   | Docker executable/daemon unavailable on this host; container recipe is source-reviewed only. Compiled server/static path was exercised independently |
| Live Agicap Public API connector                                         | **Not executed**                                   | Login credentials are not API client credentials. Thirty adapter tests use injected synthetic responses                                              |

The final browser workflows cover:

1. All seven treasury routes without application errors.
2. Transaction creation, server-side search and persistence after reload.
3. Scenario selection and weekly forecast aggregation.
4. CSV preview and confirmed import with exact cents.
5. Empty-installation company/account onboarding and a working forecast.
6. Mobile navigation without page-level horizontal overflow.
7. Partial reconciliation with searchable unallocated cash, wrong-account/transfer/allocation exclusion, and reset on reopening.
8. Booking creation with exact customer and supplier installment totals, persisted reload and detail view.

The synthetic backup drill preserved **86 transactions**, **97 obligations**, **219 audit entries**, revision **219**, and forecast closing balance **23,597,904 cents**. This checks the backup mechanism on a known fixture, not an organization's production recovery objectives or data retention policy.

## Financial and persistence invariants

The suites exercise safe integer cents and exact ratios, malformed inputs, leap/DST/calendar boundaries, closed-balance cutoffs, expected/actual separation, daily minimum liquidity, transfer perimeters, scenario assumptions, partial/full settlement conservation, transaction-allocation reuse refusal, booking schedule ownership, no-op paid booking preservation, generated-ID collision rollback, immutable reconciled fields, category-direction consistency, idempotence, atomic imports and import conflict refusal.

Search tests cover literal punctuation/wildcards/quotes/nulls, Italian Unicode case handling, per-field substring semantics, stable filters/order/counts, transactional index maintenance, rollback and migration/reopen. The compact lookup is derived state owned by Store; unsupported direct SQL writes can bypass it and the audit contract.

The connector tests establish local behavior for OAuth caching, concurrency, bounded reads/retries, cancellation, expiry and redacted errors. They do not establish live access, subscription entitlement, full migration availability or real bank connectivity.

## Performance measurements

See [performance.md](performance.md) for datasets, raw samples, CPU times, memory, checksums and tradeoffs. The host is a shared Intel Xeon Gold 6226R Linux x64 machine with 12 visible logical CPUs.

- Engine: 100,000 transactions + 10,000 obligations, 365 days, observed warm median **164.99 ms**.
- SQLite/API handler: final uncached forecast median **473.40 ms**, cached **0.54 ms**.
- A 100-row transaction page: final median **6.84 ms**.
- A searched/filtered page: **323.92 → 21.86 ms** across the recorded initial/final runs.
- The projection improves those read paths but increases audited bulk-seed time (**2.12 → 5.13 s**) and observed process memory; the uncached forecast did not become faster.

These are in-process fixture measurements. They exclude HTTP socket/TLS/WAN latency and browser rendering; they are not concurrent load tests or comparisons against Agicap. Peak RSS includes fixture construction and runtime/JIT work, not just one request.

## Explicitly unverified or planned

Real bank feeds; PSD2/EBICS/SWIFT connectivity; payment execution and signing; production email/OCR; SSO, per-person RBAC and tenant isolation; statutory Italian tax/e-invoicing/accounting correctness; production backup RPO/RTO; sustained concurrent load; independent security assurance; container runtime; live authenticated Agicap Public API operations. See [roadmap](roadmap.md) and [feature matrix](research/parity-matrix.md).
