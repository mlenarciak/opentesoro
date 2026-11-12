# Agicap research and OpenTesoro product direction

Research date: **2026-11-12**. This is an original implementation plan informed by public documentation, not an assertion that OpenTesoro already matches Agicap. Private-instance observations, if obtained by the lead, must be recorded separately without customer data or credentials.

## Evidence and scope

The public developer portal, its publicly accessible API catalog, and current OpenAPI documents were read. A documentation route can return only an HTML application shell to a non-browser client; in that case the portal's public schema endpoint was used: `https://api.agicap.com/portal-api/apis/{apiId}/schema`. These are documentation requests, not calls to a customer's business API. No authenticated business API call was made by this research task, no credential was generated, and no Agicap records were created or changed.

The public catalog contained **19 versioned contracts** on the research date. It is a product integration catalog, not a guarantee that every UI operation has a supported public API. In particular, no general-purpose forecast, scenario, cash category, or paid-transaction listing contract was advertised there. That is a catalog observation, not proof that no other contracted integration exists.

## Product capabilities and original requirements

| Capability family     | Publicly described Agicap behavior                            | OpenTesoro design requirement                                                                                                                 |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily treasury        | Account/entity balances, reconciliation, liquidity monitoring | Opening-balance snapshots with explicit as-of dates; actual cash movement ledger; entity/account filters; clear freshness                     |
| Short-term forecast   | Daily/weekly/monthly views, including a 13-week horizon       | Deterministic buckets, residual obligations, running balances, minimum liquidity and date of shortfall                                        |
| Long-term planning    | P&L conversion, historical assumptions, recurring flows       | Separate assumptions from commitments; eventually add versioned budgets and configurable conversion rules                                     |
| Scenarios             | Stress testing and alternative assumptions                    | Named, reproducible amount/timing adjustments without editing actuals                                                                         |
| Consolidation         | Group and subsidiary views, currency conversion               | EUR-first consolidation; explicit currency validation; later FX sources, rate dates, and intercompany elimination                             |
| Operational drilldown | Category/entity/project analysis and variance reporting       | Every bucket should lead back to its transactions and obligations; persist forecast snapshots before claiming historical plan/actual variance |
| Receivables           | Collection and payment-behavior insights                      | Aging and actionable collection queue first; reminders only through configured channels with explicit sending authority                       |
| Payables              | Supplier invoices, purchasing, approvals                      | Supplier obligations and due dates first; approval policy, document workflow, and payment execution are distinct later capabilities           |
| Integrations          | Bank/ERP/API connectivity                                     | Stable external references, repeatable import preview/commit, idempotency, source provenance, SDK and documented REST                         |

The first four rows draw on [Cash Management](https://agicap.com/en/products/cash-management/); longer-term planning on [Cash-flow planning](https://agicap.com/en/products/cash-flow-planning/); consolidation on [Consolidation](https://agicap.com/en/features/consolidation/). Broader AP/AR and integration positioning appears on [Agicap's product overview](https://agicap.com/en/). These are vendor capability descriptions, not independent performance measurements.

## What should make OpenTesoro useful

A finance user should answer five questions without rebuilding a spreadsheet:

1. How much available cash do we have, on which accounts, and when was each balance confirmed?
2. What cash is committed over the next 13 weeks, and which documents or bookings produce it?
3. What is the worst cash point if customers pay later or supplier costs rise?
4. Which overdue receivables, upcoming supplier balances, and uncategorized movements need action today?
5. Can we reproduce the result through an API or embedded library in another project?

For tour operators, profit and cash are especially different. A profitable departure can still require advance supplier cash before customer balances arrive. Booking cash schedules are therefore primary records; a dashboard total alone is insufficient. See [Italian tour-operator workflows](italian-tour-operator.md).

## Boundaries that influence the architecture

Agicap's public [Banking Documents contract](https://api.agicap.com/api-details/banking-documents-v1) excludes export of Open Banking/PSD2-derived bank data. Its journal export is a pre-accounting workflow, not a substitute for every bank feed. Therefore OpenTesoro must remain useful with CSV and direct source-system imports instead of depending on a complete Agicap export.

Public API credentials are not the same as web login credentials. They are organization-scoped and can require product activation. Read-only inspection of the web UI does not validate a public API integration. See [current-api.md](current-api.md).

Bank feeds, payment execution, electronic invoicing, tax reporting, OCR and bank connectivity are separate integrations with operational or legal dependencies. A local demo does not implement those services merely by listing them in navigation.

## Acceptance bar

- Amount conservation holds under allocation, rounding, partial payment and reversal.
- Historical actuals are never scaled by scenario assumptions.
- Settled obligations do not remain in expected cash flow.
- A transfer between included accounts moves account cash but not group operating inflow/outflow.
- Opening snapshots and subsequent transactions use one documented cut-off convention.
- Import repeats are safe; conflicts and partial failures are visible.
- No synthetic demo data can be mistaken for the connected customer's live bank data.
- Performance claims identify dataset, hardware, process and measured percentiles; no unmeasured “faster than Agicap” claim.

## Next research after the first vertical slice

Validate account balance semantics against real statement cutoffs; import/export a synthetic booking; check business-document installment mapping; identify available sanctioned migration/export routes; validate a representative 13-week forecast with a finance operator. Payment initiation and public API credential creation require their own concrete task and should not be side effects of research.
