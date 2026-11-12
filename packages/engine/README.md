# @opentesoro/engine

Framework-independent deterministic cash-flow calculations. The package has no external runtime dependencies, database calls, network access, clock reads, or browser assumptions. Import directly into another TypeScript project, a worker, or the OpenTesoro API.

## Financial conventions

- **Money:** signed safe-integer minor units. EUR `12345` means €123.45. Receipts are positive; payments are negative. Overflow is rejected rather than rounded. Decimal input is parsed from strings; exact ratio calculations use BigInt intermediates and half-away-from-zero rounding. `addMinor` takes the safe integer fast path and falls back to BigInt when an intermediate exceeds the safe range. Formatting preserves exact cents even at `Number.MAX_SAFE_INTEGER`.
- **Currency:** each forecast consolidates exactly one currency. A mixed-currency account selection throws; foreign exchange rates are not invented. Obligations inherit the currency of their entity/account. `parseMoney` defaults to two decimal places; pass the currency's exponent explicitly for other currencies. `formatMoney` uses the currency's Intl exponent.
- **Dates:** ISO `YYYY-MM-DD`, validated against the real calendar, calculated in UTC. ISO weeks begin Monday. Dates do not depend on the host's daylight saving time.
- **Balances:** `Account.balanceMinor` is a closed balance at the **end** of `asOfDate`. A forecast must begin after every selected snapshot. Transactions on/before the account snapshot are already included and are not counted again. Later transactions before the forecast start bridge the opening balance.
- **Expectations:** an obligation's signed `amountMinor` is the contractual amount. Its `settledMinor` is always a **nonnegative absolute** amount. Forecasts include only the outstanding difference. Settlements are recorded independently of transactions; callers must persist the updated obligation and the settlement atomically.
- **Overdue items:** unpaid obligations before the forecast horizon move to its first date, with a warning. Their payment date is uncertain; this is an explicit planning assumption.
- **Scenarios:** basis points express total multipliers (`10000` = 100%, `8000` = 80%). Only expected cash changes; actual bank transactions never change. Delays may be positive or negative, bounded to 3,660 days.
- **Transfers:** balanced, two-leg transfers on the same day, visible on both selected accounts and after both snapshots, are excluded from consolidated receipts and payments. Account-filtered, unpaired, or cross-date transfers remain cash flows with a warning. This preserves the cash movement when one leg is already in a snapshot.
- **Filters:** entity filters include unassigned obligations for that entity. An account filter excludes obligations without an assigned account and warns; silently spreading them across accounts would invent data.

## Forecast example

```ts
import { buildForecast, parseMoney } from "@opentesoro/engine";

const result = buildForecast({
  accounts: [
    {
      id: "operating",
      entityId: "operator",
      name: "Conto operativo",
      bank: "Example Bank",
      currency: "EUR",
      balanceMinor: parseMoney("50000.00"),
      asOfDate: "2026-01-31",
      enabled: true,
    },
  ],
  transactions: [],
  obligations: [
    {
      id: "hotel-balance",
      entityId: "operator",
      accountId: "operating",
      dueDate: "2026-02-15",
      amountMinor: -parseMoney("10000.00"),
      settledMinor: 0,
      description: "Saldo allotment hotel",
      counterparty: "Hotel dimostrativo",
      status: "open",
    },
  ],
  from: "2026-02-01",
  to: "2026-04-30",
  granularity: "week",
});
// result.closingBalanceMinor === 4_000_000
```

Forecast outputs separate actual and expected receipts/payments, opening/closing balances, category aggregates, daily minimum liquidity (even when weekly/monthly output is requested), and warnings. The date range is inclusive and bounded to 3,661 calendar dates. Bucket boundaries follow the requested range: a partial opening week starts on the first requested date.

## Public API

| Export                                                             | Purpose                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `buildForecast(input)`                                             | Daily calculation, weekly/monthly projection, scopes, scenarios and cash minima |
| `parseMoney(text, decimals?)`                                      | Canonical decimal input (`1234.56`), exact minor units                          |
| `parseItalianMoney(text)`                                          | Italian CSV amounts (`1.234,56`, optional EUR suffix)                           |
| `minorToDecimal(value, decimals?)`                                 | Exact canonical decimal string                                                  |
| `formatMoney(value, currency?, locale?)`                           | Exact locale currency display                                                   |
| `addMinor`, `multiplyRatio`, `applyBasisPoints`                    | Checked money arithmetic                                                        |
| `assertDate`, `addDays`, `daysBetween`, `startOfWeek`, `dateRange` | UTC calendar primitives                                                         |
| `remainingMinor(obligation)`                                       | Signed outstanding cash, cancellation and settlement checks                     |
| `buildAgingReport(obligations, asOf, direction, entityIds?)`       | Current, 1–30, 31–60, 61–90, 90+ overdue bands                                  |
| `suggestReconciliation(transaction, obligations, settlements?)`    | Ranked candidates with explicit reasons; no automatic mutations                 |
| `reconcilePayment(input)`                                          | Validated partial/full allocation and updated obligation                        |
| `categorizeTransaction(transaction, rules)`                        | Deterministic priority rules, AND conditions, no executing regular expressions  |
| `buildBookingSchedule(booking)`                                    | Customer deposit/balance and supplier installments                              |
| `bookingCashExposure(bookingId, obligations)`                      | Contracted receipts, payments and cash margin                                   |
| `expandRecurringObligations(template, from, to)`                   | Weekly, monthly, quarterly and yearly obligations with stable IDs               |
| `calculateVariance(lines)`                                         | Signed category budget/actual variances                                         |

### Reconciliation persistence

`reconcilePayment` returns a new obligation and a `Settlement`. Pass **all existing settlements for the transaction** so its unallocated amount can be checked. The caller must lock or serialize updates and write both records in one database transaction. A pure function cannot prevent simultaneous database writers. Stable settlement IDs must be unique in storage. Multiple obligations may share one bank payment; allocation totals cannot exceed that payment. Transfers cannot be reconciled to trading obligations.

### Travel schedules

`TravelBooking` models booking/customer/reference/destination, booking and travel dates, gross total, deposit basis points, balance days before departure, and supplier installments. Deposit rounding and the residual balance always conserve the original total exactly. Late-booking balances fall due on the booking date. Supplier amounts are positive inputs and become negative payable obligations. Each supplier installment chooses either an explicit date or a departure-relative offset. Generated obligation IDs are deterministic; repeated creation must be idempotent in storage.

`bookingCashExposure` is a **contractual cash margin**, not accounting profit. It does not recognize revenue, compute Italian VAT/74-ter, allocate overhead, or infer taxes.

### Aging and recurrence limits

Aging reports age the **currently outstanding** obligations using the given date. They are not historical reconstructions of an earlier settlement state. Partition inputs by currency before calling aging or variance functions. Future cash timings in recurrence are contractual assumptions, not statutory tax deadlines. Month-end recurrence anchors remain stable: January 31 → February 28/29 → March 31.

## Validation and performance

```sh
bun test packages/engine
bun packages/engine/benchmark.ts
```

The test suite exercises exact money boundaries, invalid/leap dates and DST, snapshot cutoffs, partial settlement conservation, consolidated/account-filtered transfers, duplicate identities, currency refusal, scenarios, aggregation, aging, booking schedules, recurrence and budget variance.

The benchmark generates 100,000 synthetic transactions and 10,000 obligations over a 365-day horizon, warms the engine, then prints five runs, median, peak process RSS, and a result checksum. Measurements cover the in-process engine only, **excluding** fixture generation, database/network/UI work and serialization. No comparative claim against Agicap has been established. Performance varies by host and concurrency.
