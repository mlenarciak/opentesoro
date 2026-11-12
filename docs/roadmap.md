# Roadmap and feature-equivalence scope

Agicap combines treasury, bank connectivity, cash planning, receivables, payables, payments, pre-accounting and other modules. A credible equivalent is a sustained product effort. OpenTesoro's initial milestone delivers a useful independent financial core and application; it does not claim that building those components reproduces every commercial module, live connector or statutory obligation.

Status definitions: **implemented** means code exists for the stated scope, **verification pending** means the consolidated release checks still need to be recorded, **planned** means no completion claim, **external dependency** means an outside service, contract, credential or jurisdiction-specific review is also required. The detailed [parity matrix](research/parity-matrix.md) separates these layers.

## P0 — initial standalone treasury vertical slice

Implemented in source, with release verification tracked separately:

- Framework-independent TypeScript money/calendar/cash-flow engine with explicit opening snapshots, residual obligations, scenarios, aging, reconciliation suggestions/allocations, category rules, travel schedules, recurrence and simple budget-variance arithmetic.
- Bun API and SQLite persistence with version-1 schema, audit records, mutation guards, transaction import deduplication, atomic reconciliation and schedule updates.
- Typed REST SDK, generated resource OpenAPI schemas and read-only current Public API Agicap client.
- Italian React application using TanStack Router/Query, shadcn components and Recharts for cash overview, forecast/scenarios, transactions, receivables/payables, bookings, accounts and import/integration workflows.
- Synthetic Italian tour-operator examples, CSV preview/commit/export, JSON record export and basic bearer write/read authority.

The financial engine is the durable integration boundary: other projects can use it without adopting the UI, database or web framework. The standalone application remains a first release with a constrained EUR and trust model. See [verification](verification.md) for actual checks rather than interpreting this scope list as production certification.

## P1 — operational depth and migration quality

1. **Source adapters and import contracts.** Add statement adapters for agreed CAMT/CBI/MT940 variants, balance/transaction reconciliation, provider identity, repeat-safe jobs, changed-row conflicts and source-level reconciliation reports. Scope each format against real, permissioned fixtures.
2. **Booking and document ownership.** Link a booking installment, invoice and bank settlement without duplicate expected cash. Support allotments independent of sold bookings, multi-supplier schedules in the application, paid cancellations, refund offsets, credit notes and reversals.
3. **Plan history.** Persist named forecast snapshots, approvals and assumptions. Build true historical plan/actual and plan/plan analysis; pure variance arithmetic is not a versioned planning product.
4. **Reconciliation workbench.** Extend the existing partial allocations into reviewed batch proposals, reversal/unmatch workflows, complex remittances, fees and exact source-total verification.
5. **Richer forecasting.** Expose recurrence templates in API/UI; add category-specific assumptions, collection behavior, manual overrides with explanations and explicit model versions. Test against known historical periods before promoting predictive models.
6. **Operational reporting.** Saved filters, export parity, consistent entity/account scope, large-list keyset pagination, source freshness and error recovery. Complete keyboard/screen-reader review and verify critical workflows across devices.
7. **Sanctioned Agicap migration.** Use the limited read-only client only where current products and credentials permit. Treat PSD2-export restrictions and document-readback semantics as actual boundaries; do not depend on private session APIs as a permanent connector.

## P2 — organization controls and production operations

Add user accounts, SSO/OIDC, explicit RBAC, per-person audit identity, secret rotation, session lifecycle, tenant isolation if required, network policy, durable jobs, webhook delivery/inbox deduplication and monitoring. Define retention and backup objectives, verify restores, audit migrations and measure security controls. These are product capabilities, not configuration comments.

Benchmark actual workloads end to end before changing storage. Possible extensions include Postgres through an explicit store port, queue-backed imports, incremental forecast inputs, query-plan monitoring and worker isolation for expensive jobs. SQLite remains appropriate for the intended local deployment until measurements establish a bottleneck.

## P3 — financial integrations requiring additional authority

| Area                                  | Required work beyond the initial release                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PSD2/Open Banking                     | Select a provider, establish permitted access/consent and secure token lifecycle; implement source freshness, reconnects and balance semantics                                      |
| SEPA/other payment execution          | Supported bank/payment partner, beneficiary verification, signing, sanctions/operational controls where applicable, dual approval, replay-safe submission and status reconciliation |
| Supplier AP/OCR                       | Document storage, extraction quality, human verification, purchase workflows and payable ownership                                                                                  |
| Customer collection messages          | Configured mail/delivery providers, templates, sender authority, retries, delivery evidence and opt-out/communication rules as applicable                                           |
| FX and multi-currency                 | Explicit rate source/date/version, rounding policy, currency-aware reconciliation and reporting; no invented conversions                                                            |
| Debt, factoring and investments       | Contract conventions, schedules, interest and fees, covenants, accounting/cash distinctions and tested instrument cases                                                             |
| Italian electronic invoicing / SdI    | Supported integration and jurisdiction-specific document/status handling, independently validated                                                                                   |
| F24 / VAT / travel-agency tax regimes | Accountant-approved jurisdiction/version rules and authoritative sources; first release only accepts explicitly supplied cash obligations                                           |
| Accounting compliance                 | Validated chart mapping, journal/reversal policies, retention, closing controls and accounting-system reconciliation                                                                |

No roadmap item should be advertised as “connected,” “compliant,” “automatic” or “feature-equivalent” until its actual scope is implemented and verified. A paid Agicap product feature observed in public marketing is not evidence that the inspected account exposes it or that its Public API permits full export.

## Research observations

Public research recorded 19 versioned API contracts and 251 operations on 2026-11-12. Authorized account login was inspected read-only by the lead; the account showed a trial/no active subscription state. That observation informs availability limits and does not constitute a test of every module. Credentials, customer records, private UI assets and session captures are excluded from the repository.

## Next release acceptance

Use an agreed synthetic and permissioned finance dataset to demonstrate: verified opening balances, repeat-safe import, deposits/final balances, supplier commitments, partial settlement, delayed collections, liquidity trough, scenario comparison, recovery after failed writes and a successful database restore. Record source revision, executed commands, known gaps and user acceptance. An attractive chart is useful only if these cash and ownership invariants hold.
