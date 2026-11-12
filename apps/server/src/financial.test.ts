import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { Store, type RecordData } from "./store";
import type { Forecast, Obligation, Settlement } from "@opentesoro/engine";
let store: Store;
let handle: ReturnType<typeof createApp>;
beforeEach(() => {
  store = new Store();
  handle = createApp(store);
  store.put("entities", {
    id: "operator",
    name: "Synthetic operator",
    currency: "EUR",
  });
  store.put("entities", {
    id: "other",
    name: "Other synthetic entity",
    currency: "EUR",
  });
  store.put("accounts", {
    id: "bank",
    entityId: "operator",
    name: "Operating",
    bank: "Synthetic",
    currency: "EUR",
    balanceMinor: 100_000,
    asOfDate: "2026-01-31",
    enabled: true,
  });
  store.put("categories", {
    id: "customer-receipts",
    name: "Receipts",
    direction: "inflow",
  });
  store.put("categories", {
    id: "supplier-payments",
    name: "Suppliers",
    direction: "outflow",
  });
  store.db.query("INSERT INTO metadata VALUES('asOfDate','2026-02-10')").run();
});
afterEach(() => store.close());
const request = (path: string, method = "GET", body?: unknown) =>
  handle(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
async function create(collection: string, body: unknown) {
  const response = await request(`/${collection}`, "POST", body);
  expect(response.status).toBe(201);
  return (await response.json()) as RecordData;
}
const expected = (id = "due", overrides: Record<string, unknown> = {}) => ({
  id,
  entityId: "operator",
  accountId: "bank",
  dueDate: "2026-02-03",
  amountMinor: 50_000,
  settledMinor: 0,
  status: "open",
  description: "Booking balance",
  counterparty: "Synthetic customer",
  categoryId: "customer-receipts",
  ...overrides,
});
const bankTransaction = (
  id = "tx",
  overrides: Record<string, unknown> = {},
) => ({
  id,
  entityId: "operator",
  accountId: "bank",
  date: "2026-02-02",
  amountMinor: 20_000,
  description: "Booking payment",
  counterparty: "Synthetic customer",
  categoryId: "customer-receipts",
  ...overrides,
});
const booking = () => ({
  id: "booking",
  entityId: "operator",
  accountId: "bank",
  reference: "OT-001",
  customer: "Synthetic customer",
  destination: "Puglia",
  departureDate: "2026-04-01",
  returnDate: "2026-04-08",
  bookingDate: "2026-02-01",
  totalMinor: 100_000,
  depositBasisPoints: 3000,
  balanceDaysBefore: 30,
  supplierName: "Synthetic hotel",
  supplierCostMinor: 70_000,
  supplierDepositBasisPoints: 2000,
  supplierBalanceDaysBefore: 14,
  status: "confirmed",
});
const getForecast = async () => {
  const response = await request(
    "/forecast?from=2026-02-01&to=2026-04-30&granularity=month",
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Forecast;
};
describe("financial API integration", () => {
  test("bank snapshot cutoff and bridge transactions conserve opening balance", async () => {
    await create(
      "transactions",
      bankTransaction("included", { date: "2026-01-31", amountMinor: 900_000 }),
    );
    await create(
      "transactions",
      bankTransaction("new", {
        date: "2026-02-02",
        amountMinor: -10_000,
        categoryId: "supplier-payments",
      }),
    );
    const response = await request("/forecast?from=2026-02-10&to=2026-02-28");
    expect(response.status).toBe(200);
    const result = (await response.json()) as Forecast;
    expect(result.openingBalanceMinor).toBe(90_000);
    expect(result.closingBalanceMinor).toBe(90_000);
    expect(result.totalInflowMinor).toBe(0);
  });
  test("partial settlement atomically updates the obligation and leaves only residual expected cash", async () => {
    await create("transactions", bankTransaction());
    await create("obligations", expected());
    const reconciled = await request("/reconciliation", "POST", {
      transactionId: "tx",
      obligationId: "due",
      amountMinor: 20_000,
    });
    expect(reconciled.status).toBe(201);
    expect(store.get<Obligation>("obligations", "due")?.settledMinor).toBe(
      20_000,
    );
    expect(store.list<Settlement>("settlements")).toHaveLength(1);
    const forecast = await getForecast();
    expect(forecast.closingBalanceMinor).toBe(150_000);
    expect(forecast.totalInflowMinor).toBe(50_000);
    expect(
      forecast.periods.reduce((sum, p) => sum + p.expectedInflowMinor, 0),
    ).toBe(30_000);
  });
  test("same bank payment cannot be allocated twice and failed allocation leaves no writes", async () => {
    await create("transactions", bankTransaction());
    await create("obligations", expected());
    await create("obligations", expected("due-2"));
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "tx",
          obligationId: "due",
          amountMinor: 20_000,
        })
      ).status,
    ).toBe(201);
    const revision = store.revision();
    const failed = await request("/reconciliation", "POST", {
      transactionId: "tx",
      obligationId: "due-2",
      amountMinor: 1,
    });
    expect(failed.status).toBe(422);
    expect(store.get<Obligation>("obligations", "due-2")?.settledMinor).toBe(0);
    expect(store.list("settlements")).toHaveLength(1);
    expect(store.revision()).toBe(revision);
  });
  test("final settlement removes expected cash without removing the actual receipt", async () => {
    await create(
      "transactions",
      bankTransaction("full", { amountMinor: 50_000 }),
    );
    await create("obligations", expected());
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "full",
          obligationId: "due",
          amountMinor: 50_000,
        })
      ).status,
    ).toBe(201);
    const result = await getForecast();
    expect(result.closingBalanceMinor).toBe(150_000);
    expect(
      result.periods.reduce((sum, p) => sum + p.expectedInflowMinor, 0),
    ).toBe(0);
    expect(
      (await request("/transactions/full", "PATCH", { amountMinor: 60_000 }))
        .status,
    ).toBe(409);
  });
  test("booking creates deterministic cent-conserving customer and supplier schedule", async () => {
    await create("bookings", booking());
    const rows = store
      .list<Obligation>("obligations")
      .filter((o) => o.bookingId === "booking");
    expect(rows).toHaveLength(4);
    expect(
      rows
        .filter((o) => o.amountMinor > 0)
        .reduce((sum, o) => sum + o.amountMinor, 0),
    ).toBe(100_000);
    expect(
      rows
        .filter((o) => o.amountMinor < 0)
        .reduce((sum, o) => sum + o.amountMinor, 0),
    ).toBe(-70_000);
    expect(rows.find((o) => o.id === "booking:balance")?.dueDate).toBe(
      "2026-03-02",
    );
    const result = await getForecast();
    expect(result.closingBalanceMinor).toBe(130_000);
  });
  test("unpaid booking cancellation removes generated expectations atomically", async () => {
    await create("bookings", booking());
    expect(
      (await request("/bookings/booking", "PATCH", { status: "cancelled" }))
        .status,
    ).toBe(200);
    expect(
      store
        .list<Obligation>("obligations")
        .filter((o) => o.bookingId === "booking"),
    ).toHaveLength(0);
    expect((await getForecast()).closingBalanceMinor).toBe(100_000);
  });
  test("paid booking cannot silently delete its settled schedule through cancellation", async () => {
    await create("bookings", booking());
    await create(
      "transactions",
      bankTransaction("deposit", { amountMinor: 30_000 }),
    );
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "deposit",
          obligationId: "booking:deposit",
          amountMinor: 30_000,
        })
      ).status,
    ).toBe(201);
    expect(
      (await request("/bookings/booking", "PATCH", { status: "cancelled" }))
        .status,
    ).toBe(409);
    expect(
      store.get<Obligation>("obligations", "booking:deposit")?.settledMinor,
    ).toBe(30_000);
    expect(store.list("settlements")).toHaveLength(1);
  });
  test("internal transfers cannot settle an external receivable", async () => {
    await create(
      "transactions",
      bankTransaction("transfer", { transferId: "internal" }),
    );
    await create("obligations", expected());
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "transfer",
          obligationId: "due",
          amountMinor: 100,
        })
      ).status,
    ).toBe(422);
    expect(store.get<Obligation>("obligations", "due")?.settledMinor).toBe(0);
    expect(store.list("settlements")).toHaveLength(0);
  });
  test("reconciled commercial receipt cannot be reclassified as an internal transfer", async () => {
    await create("transactions", bankTransaction());
    await create("obligations", expected());
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "tx",
          obligationId: "due",
          amountMinor: 20_000,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request("/transactions/tx", "PATCH", {
          transferId: "misclassified",
        })
      ).status,
    ).toBe(409);
    expect(
      store.get<RecordData>("transactions", "tx")?.transferId,
    ).toBeUndefined();
  });
  test("account with outstanding obligations cannot move to another entity", async () => {
    await create("obligations", expected());
    const moved = await request("/accounts/bank", "PATCH", {
      entityId: "other",
    });
    expect(moved.status).toBe(409);
    expect(store.get<RecordData>("accounts", "bank")?.entityId).toBe(
      "operator",
    );
    expect((await getForecast()).closingBalanceMinor).toBe(150_000);
  });
});

describe("schedule ownership and category mutation regressions", () => {
  test("no-op booking update preserves paid installments and existing settlement identities", async () => {
    await create("bookings", booking());
    await create(
      "transactions",
      bankTransaction("deposit", { amountMinor: 30_000 }),
    );
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "deposit",
          obligationId: "booking:deposit",
          amountMinor: 30_000,
        })
      ).status,
    ).toBe(201);
    const before = await getForecast();
    const settlements = store.list<Settlement>("settlements");
    const response = await request("/bookings/booking", "PATCH", {});
    expect(response.status).toBe(200);
    expect(
      store.get<Obligation>("obligations", "booking:deposit")?.settledMinor,
    ).toBe(30_000);
    expect(
      store.get<Obligation>("obligations", "booking:deposit")?.status,
    ).toBe("settled");
    expect(store.list<Settlement>("settlements")).toEqual(settlements);
    expect((await getForecast()).closingBalanceMinor).toBe(
      before.closingBalanceMinor,
    );
  });
  test("generated obligation cannot change booking owner after payment", async () => {
    await create("bookings", booking());
    await create("bookings", {
      ...booking(),
      id: "other-booking",
      reference: "OT-002",
    });
    await create(
      "transactions",
      bankTransaction("deposit", { amountMinor: 30_000 }),
    );
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "deposit",
          obligationId: "booking:deposit",
          amountMinor: 30_000,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request("/obligations/booking:deposit", "PATCH", {
          bookingId: "other-booking",
        })
      ).status,
    ).toBe(409);
    expect(
      store.get<Obligation>("obligations", "booking:deposit")?.bookingId,
    ).toBe("booking");
  });
  test("booking schedule cannot overwrite an existing independent paid obligation with the same ID", async () => {
    await create("obligations", expected("booking:deposit"));
    await create("transactions", bankTransaction());
    expect(
      (
        await request("/reconciliation", "POST", {
          transactionId: "tx",
          obligationId: "booking:deposit",
          amountMinor: 20_000,
        })
      ).status,
    ).toBe(201);
    const response = await request("/bookings", "POST", booking());
    expect(response.status).toBe(409);
    expect(store.get("bookings", "booking")).toBeUndefined();
    expect(
      store.get<Obligation>("obligations", "booking:deposit")?.settledMinor,
    ).toBe(20_000);
    expect(
      store.get<Obligation>("obligations", "booking:deposit")?.amountMinor,
    ).toBe(50_000);
    expect(store.list("settlements")).toHaveLength(1);
  });
  test("category direction cannot invalidate its existing cash receipts", async () => {
    await create("transactions", bankTransaction());
    expect(
      (
        await request("/categories/customer-receipts", "PATCH", {
          direction: "outflow",
        })
      ).status,
    ).toBe(409);
    expect(
      store.get<RecordData>("categories", "customer-receipts")?.direction,
    ).toBe("inflow");
  });
});
