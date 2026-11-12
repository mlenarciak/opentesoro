# OpenTesoro web application

Italian-first treasury workspace built with React, TanStack Router, TanStack Query, Vite, Tailwind CSS, shadcn/ui (Radix primitives), Lucide, Sonner and Recharts. All libraries are open source. The UI is an independent API consumer; financial calculations remain in `@opentesoro/engine` and persistence remains in the server.

From the repository root:

```sh
bun install
bun dev
```

Development runs at `http://127.0.0.1:5173` and proxies API requests to port 3000. Production uses `bun run build` then `bun start`; Bun serves the generated static bundle and REST API together. No SSR service is required.

## Routes and working operations

| Route           | Behavior                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`             | Canonical cash balance, upcoming commitments, cash trajectory and recent transactions                                     |
| `/movimenti`    | Server-paginated search and filters, category assignment, manual transaction creation, CSV export                         |
| `/previsioni`   | Forecast with custom dates, day/week/month aggregation, scenario selection and creation, separate actual/expected columns |
| `/scadenze`     | Receivable/payable/open/overdue filters, commitment creation, partial/full bank reconciliation                            |
| `/prenotazioni` | Booking creation, automatic customer and supplier schedules, payment progress and schedule detail                         |
| `/conti`        | Entity creation, account creation with dated balance snapshots, current balances, account inclusion in forecasts          |
| `/integrazioni` | CSV file/text preview and commit, deduplication feedback, CSV/JSON export, categorization rules and session-token entry   |

## Financial and data boundaries

- Domain and API types come from `@opentesoro/sdk`; no separate frontend domain model.
- Form amounts are parsed from decimal strings by the shared exact engine. No floating-point money conversion at the input boundary.
- Display uses shared exact money formatting. Ratios and compact chart axis labels are display-only approximations.
- Default forecast dates start strictly after all selected active account snapshots. Calendar labels use UTC explicitly, preserving the date in any browser time zone.
- The dashboard and account cards use authoritative server balances, never sums over a truncated transaction sample. Recent movement previews use the bounded bootstrap window; the full movements route uses server pagination.
- The sidebar scope filters the financial views by entity. Mutations preserve the selected account's entity relationship.
- The empty installation supports creating a company before adding accounts. No demonstration records are synthesized in the browser.
- API tokens are optional for loopback development and stored only in sessionStorage when entered. Export requests carry the same Bearer token; no token is placed in a URL.
- External banking and Agicap connectivity is labeled according to actual implementation status. No button silently connects an account or transmits financial data.

## Structure

`src/main.tsx` defines code-based routes with lazy page loading. `src/lib/api.ts` owns browser transport, query invalidation and presentation boundaries. `src/lib/context.tsx` owns entity scope. Shared application components are in `src/components/`; vendored editable shadcn components are in `src/components/ui/`. Semantic theme tokens live in `src/styles.css`.

The seven pages are deliberately task-oriented. Forecast math, reconciliation validation, settlement allocation, import validation, and financial integrity belong on the server/engine and must never be reconstructed from chart values.

## Verification

```sh
bun run typecheck
bun test apps/web/src/lib/api.test.ts
bun run build
```

The UI boundary tests cover safe-integer cent precision, invalid amounts, snapshot-aware forecast start dates, leap days, and time-zone-stable calendar labels. Browser QA should exercise visible workflows against an isolated synthetic database. A successful static build alone does not verify backend behavior.
