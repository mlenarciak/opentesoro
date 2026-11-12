# Verification ledger

Recorded on **2026-11-12**, OpenTesoro **0.1.0**, Bun **1.3.13**, Linux x64. All business fixtures are synthetic. These checks establish a tested first milestone, not full Agicap parity or production certification.

## Blue interface and public demo update

The following checks supersede the earlier app/test counts for this update. Older backup and connector results below remain historical evidence; those checks were not repeated because their implementations did not change.

| Check                        | Result                               | Scope                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run check`              | **161 tests, 667 assertions passed** | Strict TypeScript; existing financial, API, persistence and SDK checks; 13 public-session server tests and 8 browser-client state tests; frontend and both server launchers build                |
| Browser workflows            | **14 scenarios passed**              | Eight existing workflows, four blue-theme/accessibility workflows and two public-demo workflows                                                                                                  |
| Theme and accessibility      | Passed                               | Light/dark persistence, square corners, financial colors, desktop/mobile axe checks, keyboard focus, Escape, named table regions with ArrowRight scrolling and no page overflow                  |
| Public session boundaries    | Passed                               | Independent visitors, CSRF/origin enforcement, expiry/reset, stale tabs, request/storage/creation limits and refusal of private/provider configuration                                           |
| Production demo container    | Passed                               | Actual Docker build; non-root process, read-only root filesystem, 0.5 CPU/1 GiB limits; both public browser workflows repeated through the container; persistent database configuration rejected |
| CloudFront CSP compatibility | Passed locally                       | Actual built container page exercised with the exact reviewed CSP; no browser console errors                                                                                                     |
| Infrastructure               | Passed                               | Strict TypeScript, 4 CDK assertions, strict synth, source allowlist/private-file exclusions and review of a new standalone stack                                                                 |

Live AWS acceptance passed at [the published HTTPS demo](https://d1y5vmh8a5ngxz.cloudfront.net): both public browser workflows; desktop/mobile overview in light/dark with zero axe violations, no page overflow and no browser console errors; horizontal keyboard table scrolling; theme persistence and mobile focus return. HTTP checks confirmed CSRF/origin enforcement, uncached authorization errors, JSON API failures, SPA deep links and security headers. CloudFormation completed, the exact reviewed image digest is running, and the internal load balancer has a healthy target. The application role has no attached or inline policies and there is no public ingress to the task.

The clean GitHub runner also passed the complete workflow for the final accessibility source (`8600c3d`): [CI run 43280575706](https://github.com/mlenarciak/opentesoro/actions/runs/43280575706), including frozen installs, all 161 app tests, all 14 browser scenarios, four infrastructure assertions, offline strict synthesis and the real Docker build.

The demo container used about 78 MiB after these browser checks. This is one observed value, not a concurrency or capacity guarantee. The exact staged deployment image was also exercised in a read-only container: four desktop/mobile light/dark axe passes, real horizontal keyboard scrolling, retained theme choice, mobile focus return and no browser console errors. The AWS deployment record is maintained in the [infrastructure runbook](../infra/README.md).

## Initial milestone checks

| Check                                                                    | Result                                             | Scope                                                                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                          | Passed                                             | Locked workspace installation                                                                                                                        |
| Fresh public clone                                                       | Passed                                             | Separate directory cloned from GitHub; frozen install, strict typecheck, all 140 tests and client/server build passed                                |
| Bun-only frontend build                                                  | Passed                                             | Build completed with PATH containing Bun and no Node executable                                                                                      |
| GitHub Actions                                                           | Passed                                             | [Initial published revision CI](https://github.com/mlenarciak/opentesoro/actions/runs/43134163834): install, check/build and all browser workflows   |
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

Real bank feeds; PSD2/EBICS/SWIFT connectivity; payment execution and signing; production email/OCR; SSO, per-person RBAC and business-tenant isolation; statutory Italian tax/e-invoicing/accounting correctness; production backup RPO/RTO; sustained concurrent load; independent security assurance; private persistent-container runtime; live authenticated Agicap Public API operations. Per-visitor synthetic demo isolation and its container were tested as recorded above. See [roadmap](roadmap.md) and [feature matrix](research/parity-matrix.md).
