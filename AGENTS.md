# OpenTesoro

Open-source treasury and cash-flow platform for Italian tour operators.

## Working rules

- TypeScript strict; Bun workspaces. Engine has no database, framework, or network dependencies.
- Money is signed integer minor units. EUR-first; never silently consolidate currencies.
- Dates are validated ISO calendar dates; no floating-point money or timezone-dependent calendar arithmetic.
- Forecasts must distinguish actual transactions, expected obligations, and scenario assumptions; avoid double counting reconciled payments and internal transfers.
- All new behavior needs meaningful tests, especially financial invariants and API persistence.
- Use synthetic examples only. Never commit credentials, cookies, session captures, customer records, or bank data.
- Agicap research is read-only. Public docs and authorized UI observations inform original implementations; never copy proprietary code/assets.
- Record implemented vs planned vs externally dependent capabilities truthfully.
- Agents may work in parallel; ownership is assigned by the lead. Do not edit other agents' assigned directories without coordination.
- Use shadcn/ui default neutral tokens and accessible components; charts via Recharts.
