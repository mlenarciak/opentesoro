import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMinor,
  applyBasisPoints,
  assertDate,
  buildAgingReport,
  buildBookingSchedule,
  buildForecast,
  bookingCashExposure,
  categorizeTransaction,
  dateRange,
  daysBetween,
  minorToDecimal,
  parseItalianMoney,
  parseMoney,
  reconcilePayment,
  remainingMinor,
  startOfWeek,
  suggestReconciliation,
} from "./index";
import type { Account, ForecastInput, Obligation, Transaction } from "./index";
const account: Account = {
  id: "bank-a",
  entityId: "company",
  name: "Operating",
  bank: "Example",
  currency: "EUR",
  balanceMinor: 100_000,
  asOfDate: "2026-01-31",
  enabled: true,
};
const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "tx",
  entityId: "company",
  accountId: "bank-a",
  date: "2026-02-02",
  amountMinor: 20_000,
  description: "Booking B001",
  counterparty: "Rossi",
  ...overrides,
});
const obligation = (overrides: Partial<Obligation> = {}): Obligation => ({
  id: "due",
  entityId: "company",
  accountId: "bank-a",
  dueDate: "2026-02-03",
  amountMinor: 50_000,
  settledMinor: 0,
  description: "Balance",
  counterparty: "Rossi",
  status: "open",
  ...overrides,
});
const forecast = (overrides: Partial<ForecastInput> = {}) =>
  buildForecast({
    accounts: [account],
    transactions: [],
    obligations: [],
    from: "2026-02-01",
    to: "2026-02-28",
    ...overrides,
  });
describe("integer money", () => {
  test("decimal input never passes through floats", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("-1234.56")).toBe(-123456);
    expect(parseMoney("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(minorToDecimal(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  });
  test("strict parsing rejects ambiguous and excess precision", () => {
    for (const input of ["1e3", "1,23", "NaN", "1.005", "1.", ""])
      expect(() => parseMoney(input)).toThrow();
    expect(() => parseMoney("90071992547409.92")).toThrow();
  });
  test("Italian bank amounts", () => {
    expect(parseItalianMoney("-1.234.567,89 EUR")).toBe(-123456789);
    expect(parseItalianMoney("12,1")).toBe(1210);
    expect(() => parseItalianMoney("12.34")).toThrow();
  });
  test("safe exact intermediates and overflow refusal", () => {
    expect(addMinor(Number.MAX_SAFE_INTEGER, 1, -1)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow();
    expect(() => addMinor(0.1)).toThrow();
  });
  test("basis points half away from zero and conservation", () => {
    expect(applyBasisPoints(101, 5000)).toBe(51);
    expect(applyBasisPoints(-101, 5000)).toBe(-51);
    expect(applyBasisPoints(1_000_000, 10500)).toBe(1_050_000);
    expect(() => applyBasisPoints(100, -1)).toThrow();
  });
});
describe("calendar dates", () => {
  test("leap years and invalid dates", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(() => assertDate("2026-02-29")).toThrow();
    expect(() => assertDate("2026-04-31")).toThrow();
    expect(() => assertDate("2026-1-01")).toThrow();
  });
  test("DST independent and ISO weeks", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(startOfWeek("2026-01-04")).toBe("2025-12-29");
    expect(startOfWeek("2026-01-05")).toBe("2026-01-05");
  });
  test("bounded horizons", () => {
    expect(dateRange("2026-01-01", "2026-01-01")).toHaveLength(1);
    expect(() => dateRange("2026-02-01", "2026-01-01")).toThrow();
    expect(() => dateRange("2000-01-01", "2026-01-01")).toThrow();
  });
});
describe("forecast invariants", () => {
  test("partial settlement counts payment and only the residual expectation", () => {
    const result = forecast({
      transactions: [transaction()],
      obligations: [obligation({ settledMinor: 20_000, status: "partial" })],
    });
    expect(result.closingBalanceMinor).toBe(150_000);
    expect(result.totalInflowMinor).toBe(50_000);
    expect(result.periods[1]?.actualInflowMinor).toBe(20_000);
    expect(result.periods[2]?.expectedInflowMinor).toBe(30_000);
  });
  test("fully settled obligation never reappears", () => {
    expect(
      forecast({
        transactions: [transaction({ amountMinor: 50_000 })],
        obligations: [obligation({ settledMinor: 50_000, status: "settled" })],
      }).totalInflowMinor,
    ).toBe(50_000);
  });
  test("snapshot transactions cannot be double counted; carry post-snapshot history into opening", () => {
    const result = forecast({
      from: "2026-02-10",
      transactions: [
        transaction({ id: "past", date: "2026-01-31", amountMinor: 999_999 }),
        transaction({ id: "bridge", date: "2026-02-02", amountMinor: -10_000 }),
      ],
    });
    expect(result.openingBalanceMinor).toBe(90_000);
    expect(result.closingBalanceMinor).toBe(90_000);
    expect(result.totalInflowMinor).toBe(0);
  });
  test("invalid snapshot horizon rejected", () => {
    expect(() => forecast({ from: "2026-01-31" })).toThrow();
  });
  test("mixed currencies require explicit conversion", () => {
    expect(() =>
      forecast({
        accounts: [account, { ...account, id: "usd", currency: "USD" }],
      }),
    ).toThrow("Mixed currencies");
  });
  test("same day internal transfers excluded from consolidated volumes; visible in account filter", () => {
    const b = { ...account, id: "bank-b", balanceMinor: 50_000 };
    const pair = [
      transaction({ id: "out", amountMinor: -30_000, transferId: "transfer" }),
      transaction({
        id: "in",
        accountId: "bank-b",
        amountMinor: 30_000,
        transferId: "transfer",
      }),
    ];
    const combined = forecast({ accounts: [account, b], transactions: pair });
    expect(combined.closingBalanceMinor).toBe(150_000);
    expect(combined.totalInflowMinor).toBe(0);
    expect(combined.totalOutflowMinor).toBe(0);
    const one = forecast({
      accounts: [account, b],
      transactions: pair,
      accountIds: ["bank-a"],
    });
    expect(one.closingBalanceMinor).toBe(70_000);
    expect(one.totalOutflowMinor).toBe(30_000);
  });
  test("partially snapshotted transfer cannot erase the pending leg", () => {
    const b = {
      ...account,
      id: "bank-b",
      asOfDate: "2026-02-02",
      balanceMinor: 30_000,
    };
    const result = forecast({
      from: "2026-02-03",
      accounts: [account, b],
      transactions: [
        transaction({
          id: "out",
          amountMinor: -30_000,
          transferId: "transfer",
        }),
        transaction({
          id: "in",
          accountId: "bank-b",
          amountMinor: 30_000,
          transferId: "transfer",
        }),
      ],
    });
    expect(result.openingBalanceMinor).toBe(100_000);
  });
  test("scenarios change only expectations, not actuals", () => {
    const result = forecast({
      transactions: [transaction()],
      obligations: [obligation()],
      scenario: {
        id: "stress",
        name: "Stress",
        inflowBasisPoints: 8000,
        outflowBasisPoints: 11000,
        inflowDelayDays: 5,
        outflowDelayDays: 0,
      },
    });
    expect(result.totalInflowMinor).toBe(60_000);
    expect(result.periods[7]?.expectedInflowMinor).toBe(40_000);
    expect(result.periods[1]?.actualInflowMinor).toBe(20_000);
  });
  test("overdue unpaid cash is carried forward and disclosed", () => {
    const result = forecast({
      obligations: [
        obligation({ dueDate: "2026-01-20", amountMinor: -120_000 }),
      ],
    });
    expect(result.periods[0]?.expectedOutflowMinor).toBe(120_000);
    expect(result.minimumBalanceMinor).toBe(-20_000);
    expect(result.warnings.join()).toContain("overdue");
  });
  test("weekly and monthly summaries conserve daily closing and totals", () => {
    const input = {
      transactions: [transaction()],
      obligations: [obligation({ amountMinor: -80_000 })],
    };
    const daily = forecast(input);
    for (const granularity of ["week", "month"] as const) {
      const result = forecast({ ...input, granularity });
      expect(result.closingBalanceMinor).toBe(daily.closingBalanceMinor);
      expect(result.totalInflowMinor).toBe(daily.totalInflowMinor);
      expect(result.totalOutflowMinor).toBe(daily.totalOutflowMinor);
      expect(result.minimumBalanceMinor).toBe(daily.minimumBalanceMinor);
    }
  });
  test("filter by entity without leaking unassigned obligations", () => {
    const result = forecast({
      entityIds: ["company"],
      obligations: [
        obligation({ id: "other", entityId: "other", accountId: undefined }),
      ],
    });
    expect(result.totalInflowMinor).toBe(0);
  });
  test("unassigned obligations excluded from account-filtered result with warning", () => {
    const result = forecast({
      accountIds: ["bank-a"],
      obligations: [obligation({ accountId: undefined })],
    });
    expect(result.totalInflowMinor).toBe(0);
    expect(result.warnings.join()).toContain("Unassigned");
  });
  test("duplicate IDs and mismatched account entities rejected", () => {
    expect(() =>
      forecast({ transactions: [transaction(), transaction()] }),
    ).toThrow();
    expect(() =>
      forecast({ transactions: [transaction({ entityId: "other" })] }),
    ).toThrow();
    expect(() =>
      forecast({ obligations: [obligation(), obligation()] }),
    ).toThrow();
    expect(() =>
      forecast({ transactions: [transaction({ accountId: "unknown" })] }),
    ).toThrow();
  });
  test("large sums fail before unsafe precision is introduced", () => {
    expect(() =>
      forecast({
        accounts: [{ ...account, balanceMinor: Number.MAX_SAFE_INTEGER }],
        transactions: [transaction()],
      }),
    ).toThrow();
  });
});
describe("reconciliation", () => {
  test("partial then final payment updates absolute settled amounts", () => {
    const first = reconcilePayment({
      transaction: transaction(),
      obligation: obligation(),
      amountMinor: 20_000,
      settlementId: "one",
    });
    expect(first.obligation.status).toBe("partial");
    expect(remainingMinor(first.obligation)).toBe(30_000);
    const second = reconcilePayment({
      transaction: transaction({ id: "next", amountMinor: 30_000 }),
      obligation: first.obligation,
      amountMinor: 30_000,
      settlementId: "two",
      settlements: [first.settlement],
    });
    expect(second.obligation.status).toBe("settled");
    expect(remainingMinor(second.obligation)).toBe(0);
  });
  test("split transaction cannot be allocated twice beyond its total", () => {
    const first = reconcilePayment({
      transaction: transaction(),
      obligation: obligation(),
      amountMinor: 15_000,
      settlementId: "one",
    });
    expect(() =>
      reconcilePayment({
        transaction: transaction(),
        obligation: obligation({ id: "second" }),
        amountMinor: 10_000,
        settlementId: "two",
        settlements: [first.settlement],
      }),
    ).toThrow("unallocated");
  });
  test("payables reconcile using nonnegative settlement amount", () => {
    const result = reconcilePayment({
      transaction: transaction({ amountMinor: -20_000 }),
      obligation: obligation({ amountMinor: -20_000 }),
      amountMinor: 20_000,
      settlementId: "supplier",
    });
    expect(result.obligation.status).toBe("settled");
    expect(result.obligation.settledMinor).toBe(20_000);
  });
  test("reject wrong direction, entity, overpay and reused settlement identity", () => {
    expect(() =>
      reconcilePayment({
        transaction: transaction(),
        obligation: obligation({ amountMinor: -50_000 }),
        amountMinor: 10,
        settlementId: "one",
      }),
    ).toThrow();
    expect(() =>
      reconcilePayment({
        transaction: transaction(),
        obligation: obligation({ entityId: "other" }),
        amountMinor: 10,
        settlementId: "one",
      }),
    ).toThrow();
    expect(() =>
      reconcilePayment({
        transaction: transaction(),
        obligation: obligation(),
        amountMinor: 100_000,
        settlementId: "one",
      }),
    ).toThrow();
  });
  test("rank candidates without settling fuzzy suggestions", () => {
    const result = suggestReconciliation(transaction(), [
      obligation({ id: "exact", amountMinor: 20_000, bookingId: "B001" }),
      obligation({ id: "other", counterparty: "Other" }),
    ]);
    expect(result[0]?.obligationId).toBe("exact");
    expect(result[0]?.score).toBe(100);
    expect(obligation().settledMinor).toBe(0);
  });
});
describe("travel schedules", () => {
  const booking = {
    id: "b1",
    entityId: "company",
    reference: "GB-001",
    customer: "Rossi",
    destination: "Sardegna",
    departureDate: "2026-07-01",
    returnDate: "2026-07-08",
    bookedDate: "2026-02-01",
    totalMinor: 100_001,
    depositBasisPoints: 3000,
    balanceDaysBeforeDeparture: 30,
  };
  test("deposit and balance conserve odd-cent total exactly", () => {
    const result = buildBookingSchedule(booking);
    expect(result[0]?.amountMinor).toBe(30_000);
    expect(result[1]?.amountMinor).toBe(70_001);
    expect(result[1]?.dueDate).toBe("2026-06-01");
    expect(addMinor(...result.map((o) => o.amountMinor))).toBe(100_001);
  });
  test("late booking balance is immediately due", () => {
    expect(
      buildBookingSchedule({ ...booking, bookedDate: "2026-06-25" })[1]
        ?.dueDate,
    ).toBe("2026-06-25");
  });
  test("supplier installments preserve explicit dates and departure offsets", () => {
    const result = buildBookingSchedule({
      ...booking,
      supplierPayments: [
        {
          id: "hotel",
          supplier: "Hotel",
          amountMinor: 60_000,
          daysBeforeDeparture: 15,
        },
        {
          id: "bus",
          supplier: "Bus",
          amountMinor: 10_000,
          dueDate: "2026-07-08",
        },
      ],
    });
    expect(result[2]?.dueDate).toBe("2026-06-16");
    expect(result[2]?.amountMinor).toBe(-60_000);
    expect(bookingCashExposure("b1", result)).toEqual({
      receiptsMinor: 100_001,
      paymentsMinor: 70_000,
      netMinor: 30_001,
    });
  });
  test("invalid deposit and conflicting supplier timing refused", () => {
    expect(() =>
      buildBookingSchedule({ ...booking, depositBasisPoints: 10001 }),
    ).toThrow();
    expect(() =>
      buildBookingSchedule({
        ...booking,
        supplierPayments: [
          {
            id: "x",
            supplier: "Hotel",
            amountMinor: 100,
            dueDate: "2026-06-01",
            daysBeforeDeparture: 10,
          },
        ],
      }),
    ).toThrow();
  });
});
describe("aging and categorization", () => {
  test("aging boundaries count only outstanding same-direction cash", () => {
    const report = buildAgingReport(
      [
        obligation({ id: "future", dueDate: "2026-03-01" }),
        obligation({ id: "today", dueDate: "2026-02-01" }),
        obligation({
          id: "30",
          dueDate: "2026-01-02",
          settledMinor: 20_000,
          status: "partial",
        }),
        obligation({ id: "31", dueDate: "2026-01-01" }),
        obligation({ id: "payable", amountMinor: -100 }),
      ],
      "2026-02-01",
      "receivable",
    );
    expect(report.buckets.map((b) => b.count)).toEqual([2, 1, 1, 0, 0]);
    expect(report.overdueMinor).toBe(80_000);
    expect(report.totalMinor).toBe(180_000);
  });
  test("cancelled and settled items omitted; inconsistent settlement refused", () => {
    expect(
      buildAgingReport(
        [obligation({ status: "cancelled" })],
        "2026-02-01",
        "receivable",
      ).totalMinor,
    ).toBe(0);
    expect(() =>
      remainingMinor(obligation({ settledMinor: 60_000 })),
    ).toThrow();
    expect(() => remainingMinor(obligation({ status: "settled" }))).toThrow();
  });
  test("rule ordering deterministic; AND conditions and accent normalization", () => {
    const rules = [
      {
        id: "z",
        name: "generic",
        priority: 20,
        enabled: true,
        categoryId: "other",
        conditions: {},
      },
      {
        id: "a",
        name: "tour receipts",
        priority: 10,
        enabled: true,
        categoryId: "sales",
        conditions: {
          descriptionIncludes: "booking",
          counterpartyIncludes: "rossi",
          direction: "inflow" as const,
        },
      },
    ];
    expect(categorizeTransaction(transaction(), rules)?.categoryId).toBe(
      "sales",
    );
    expect(
      categorizeTransaction(transaction({ amountMinor: -1 }), rules)
        ?.categoryId,
    ).toBe("other");
    expect(categorizeTransaction(transaction(), [])).toBeNull();
  });
});

describe("recurrence and budget variance", () => {
  test("month-end anchor survives February and leap years", async () => {
    const { expandRecurringObligations } = await import("./index");
    const result = expandRecurringObligations(
      {
        id: "rent",
        entityId: "company",
        description: "Rent",
        counterparty: "Landlord",
        amountMinor: -100_000,
        startDate: "2024-01-31",
        frequency: "monthly",
      },
      "2024-01-01",
      "2024-04-30",
    );
    expect(result.map((x) => x.dueDate)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
    ]);
  });
  test("old recurrence jumps directly to forecast range", async () => {
    const { expandRecurringObligations } = await import("./index");
    const result = expandRecurringObligations(
      {
        id: "rent",
        entityId: "company",
        description: "Rent",
        counterparty: "Landlord",
        amountMinor: -100_000,
        startDate: "2000-01-31",
        endDate: "2026-03-31",
        frequency: "monthly",
      },
      "2026-02-01",
      "2026-05-01",
    );
    expect(result.map((x) => x.dueDate)).toEqual(["2026-02-28", "2026-03-31"]);
  });
  test("quarterly anchor and stable occurrence IDs", async () => {
    const { expandRecurringObligations } = await import("./index");
    const template = {
      id: "lease",
      entityId: "company",
      description: "Lease",
      counterparty: "Bank",
      amountMinor: -10_000,
      startDate: "2026-01-31",
      frequency: "quarterly" as const,
    };
    expect(
      expandRecurringObligations(template, "2026-01-01", "2026-12-31").map(
        (x) => x.dueDate,
      ),
    ).toEqual(["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]);
  });
  test("signed budget comparisons distinguish overspending from higher receipts", async () => {
    const { calculateVariance } = await import("./index");
    const result = calculateVariance([
      { categoryId: "sales", budgetMinor: 100_000, actualMinor: 120_000 },
      { categoryId: "suppliers", budgetMinor: -60_000, actualMinor: -65_000 },
    ]);
    expect(result.lines.map((x) => x.varianceMinor)).toEqual([20_000, -5_000]);
    expect(result.lines.map((x) => x.favorable)).toEqual([true, false]);
    expect(result.varianceMinor).toBe(15_000);
  });
  test("formatting preserves maximum integer cents and sub-unit sign", async () => {
    const { formatMoney } = await import("./index");
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "EUR", "en-US")).toBe(
      "€90,071,992,547,409.91",
    );
    expect(formatMoney(-1, "EUR", "en-US")).toBe("-€0.01");
    expect(formatMoney(1234, "JPY", "en-US")).toBe("¥1,234");
  });
});

describe("untrusted financial boundary regressions", () => {
  test("large permitted scenarios remain exact at integer cents", () => {
    const result = forecast({
      obligations: [obligation({ amountMinor: 100_001 })],
      scenario: {
        id: "large",
        name: "Ten times",
        inflowBasisPoints: 100_000,
        outflowBasisPoints: 100_000,
        inflowDelayDays: 0,
        outflowDelayDays: 0,
      },
    });
    expect(result.totalInflowMinor).toBe(1_000_010);
    expect(result.closingBalanceMinor).toBe(1_100_010);
  });
  test("malformed scenario values are rejected", () => {
    for (const inflowBasisPoints of [NaN, Infinity, -1, 1.2])
      expect(() =>
        forecast({
          scenario: {
            id: "invalid",
            name: "Invalid",
            inflowBasisPoints,
            outflowBasisPoints: 10000,
            inflowDelayDays: 0,
            outflowDelayDays: 0,
          },
        }),
      ).toThrow();
    expect(() =>
      forecast({
        scenario: {
          id: "invalid",
          name: "Invalid",
          inflowBasisPoints: 10000,
          outflowBasisPoints: 10000,
          inflowDelayDays: 3661,
          outflowDelayDays: 0,
        },
      }),
    ).toThrow();
  });
  test("malformed actual and expected dates never enter projections", () => {
    expect(() =>
      forecast({ transactions: [transaction({ date: "2026-02-30" })] }),
    ).toThrow();
    expect(() =>
      forecast({ obligations: [obligation({ dueDate: "2026-13-01" })] }),
    ).toThrow();
    expect(() => addDays("2026-11-01", 0.5)).toThrow();
  });
  test("settlement state must agree with actual settled cash", () => {
    expect(() => remainingMinor(obligation({ status: "partial" }))).toThrow();
    expect(() =>
      remainingMinor(obligation({ settledMinor: 100, status: "open" })),
    ).toThrow();
    expect(() => remainingMinor(obligation({ amountMinor: 0 }))).toThrow();
  });
  test("transfer transactions cannot settle commercial expectations", () => {
    const tx = transaction({ transferId: "internal" });
    expect(suggestReconciliation(tx, [obligation()])).toEqual([]);
    expect(() =>
      reconcilePayment({
        transaction: tx,
        obligation: obligation(),
        amountMinor: 100,
        settlementId: "invalid",
      }),
    ).toThrow("Internal transfers");
  });
  test("early ISO years are not rewritten to the twentieth century", async () => {
    const { expandRecurringObligations } = await import("./index");
    const rows = expandRecurringObligations(
      {
        id: "calendar",
        entityId: "company",
        description: "Calendar test",
        counterparty: "Synthetic",
        amountMinor: -100,
        startDate: "0099-01-31",
        frequency: "monthly",
      },
      "0099-01-01",
      "0099-03-31",
    );
    expect(rows.map((row) => row.dueDate)).toEqual([
      "0099-01-31",
      "0099-02-28",
      "0099-03-31",
    ]);
  });
});
