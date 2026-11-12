import { describe, it, expect, afterEach } from "bun:test";
import { Store } from "./store";
import { createApp } from "./app";
import { seedDemo } from "./demo";
import { previewCsv, parseAmount, exportCsv } from "./csv";
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});
function setup(options: Parameters<typeof createApp>[1] = {}) {
  const store = new Store();
  stores.push(store);
  seedDemo(store);
  const app = createApp(store, options);
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app(
      new Request("http://localhost/api/v1" + path, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { store, app, request };
}
describe("API persistence and boundaries", () => {
  it("demo is idempotent and financial bootstrap schema is usable", async () => {
    const { request, store } = setup();
    seedDemo(store);
    const r = await request("/bootstrap");
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.entities).toHaveLength(2);
    expect(b.transactions).toHaveLength(86);
    expect(b.obligations.length).toBeGreaterThan(70);
    expect(b.demo).toBe(true);
    expect(b.transactionsTotal).toBe(86);
  });
  it("forecast returns valid aggregate and cache invalidates after changes", async () => {
    const { request } = setup();
    const first = await (await request("/forecast")).json();
    expect(first.periods).toHaveLength(6);
    expect(first.closingBalanceMinor).toBe(
      first.openingBalanceMinor +
        first.totalInflowMinor -
        first.totalOutflowMinor,
    );
    const tx = {
      entityId: "gb-tour",
      accountId: "intesa",
      date: "2026-11-12",
      amountMinor: 5000,
      description: "new receipt",
      counterparty: "test",
    };
    expect((await request("/transactions", "POST", tx)).status).toBe(201);
    const next = await (await request("/forecast")).json();
    expect(next.closingBalanceMinor - first.closingBalanceMinor).toBe(5000);
  });
  it("rejects cross-entity account assignment and invalid calendar dates", async () => {
    const { request } = setup();
    const tx = {
      entityId: "gb-incoming",
      accountId: "intesa",
      date: "2026-02-30",
      amountMinor: 500,
      description: "x",
      counterparty: "x",
    };
    expect((await request("/transactions", "POST", tx)).status).toBe(422);
    tx.date = "2026-11-12";
    expect((await request("/transactions", "POST", tx)).status).toBe(422);
  });
  it("rejects fractional minor units and mixed currencies", async () => {
    const { request } = setup();
    expect(
      (
        await request("/transactions", "POST", {
          entityId: "gb-tour",
          accountId: "intesa",
          date: "2026-11-12",
          amountMinor: 0.5,
          description: "x",
        })
      ).status,
    ).toBe(422);
    expect(
      (await request("/entities", "POST", { name: "Foreign", currency: "USD" }))
        .status,
    ).toBe(422);
  });
  it("requires auth and enforces read-only token", async () => {
    const { request } = setup({ token: "writer", readOnlyToken: "reader" });
    expect((await request("/bootstrap")).status).toBe(401);
    expect(
      (
        await request("/bootstrap", "GET", undefined, {
          authorization: "Bearer reader",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/scenarios",
          "POST",
          { name: "x" },
          { authorization: "Bearer reader" },
        )
      ).status,
    ).toBe(403);
  });
  it("rejects cross-origin browser writes and unsupported content type", async () => {
    const { request, app } = setup();
    expect(
      (
        await request(
          "/scenarios",
          "POST",
          { name: "x" },
          { origin: "https://attacker.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app(
          new Request("http://localhost/api/v1/scenarios", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(415);
  });
  it("rejects deleting referenced accounts and categories", async () => {
    const { request } = setup();
    expect((await request("/accounts/intesa", "DELETE")).status).toBe(409);
    expect(
      (await request("/categories/customer-receipts", "DELETE")).status,
    ).toBe(409);
  });
  it("paginated filtering is bounded and deterministic", async () => {
    const { request } = setup();
    const p = await (
      await request("/transactions?entityId=gb-tour&limit=5&offset=3")
    ).json();
    expect(p.items).toHaveLength(5);
    expect(p.items.every((x: any) => x.entityId === "gb-tour")).toBe(true);
    expect((await request("/transactions?limit=1001")).status).toBe(422);
  });
  it("idempotency replays requests and refuses a changed body", async () => {
    const { request, store } = setup();
    const body = { name: "Optimistic", inflowBasisPoints: 11000 };
    const h = { "idempotency-key": "scenario-one" };
    const first = await request("/scenarios", "POST", body, h);
    const a = await first.json();
    expect(first.status).toBe(201);
    const b = await (await request("/scenarios", "POST", body, h)).json();
    expect(a.id).toBe(b.id);
    expect(
      (await request("/scenarios", "POST", { ...body, name: "Other" }, h))
        .status,
    ).toBe(409);
    expect(store.list("scenarios")).toHaveLength(4);
  });
  it("provided record ID replays idempotently", async () => {
    const { request } = setup();
    const body = { id: "custom", name: "Custom" };
    const h = { "idempotency-key": "custom-key" };
    expect((await request("/scenarios", "POST", body, h)).status).toBe(201);
    expect((await request("/scenarios", "POST", body, h)).status).toBe(201);
  });
  it("rollback preserves records and audit when multi-write transaction fails", () => {
    const { store } = setup();
    const before = store.revision();
    expect(() =>
      store.atomic(() => {
        store.put("scenarios", { id: "rollback", name: "x" });
        throw new Error("abort");
      }),
    ).toThrow();
    expect(store.get("scenarios", "rollback")).toBeUndefined();
    expect(store.revision()).toBe(before);
  });
  it("OpenAPI reflects entity schemas and never advertises direct settlement mutation", async () => {
    const { app } = setup();
    const r = await app(new Request("http://localhost/openapi.json"));
    expect(r.status).toBe(200);
    const spec = await r.json();
    expect(spec.openapi).toBe("3.1.0");
    expect(
      spec.components.schemas.Transactions.properties.amountMinor.type,
    ).toBe("integer");
    expect(spec.paths["/api/v1/settlements"].post).toBeUndefined();
  });
});
describe("CSV import", () => {
  const csv =
    "data;descrizione;importo;controparte\n12/11/2026;Acconto;1.234,56;Cliente\n13/11/2026;Hotel;-500,20;Struttura";
  it("supports Italian dates, signed exact decimals, BOM and quoted multiline values", () => {
    const p = previewCsv("\uFEFF" + csv);
    expect(p.errors).toHaveLength(0);
    expect(p.rows[0]!.amountMinor).toBe(123456);
    expect(p.rows[1]!.amountMinor).toBe(-50020);
    const q = previewCsv(
      'date,description,amount\n2026-11-12,"two\nlines",1.01',
    );
    expect(q.rows[0]!.description).toBe("two\nlines");
    expect(parseAmount("(123,45)")).toBe(-12345);
  });
  it("refuses incomplete, malformed, and excess precision data", () => {
    expect(() => previewCsv("data;descrizione\n12/11/2026;hello")).toThrow();
    expect(() =>
      previewCsv('date,description,amount\n2026-11-12,"unclosed,1'),
    ).toThrow();
    expect(
      previewCsv("date,description,amount\n2026-02-30,x,1.001").errors,
    ).toHaveLength(1);
  });
  it("imports atomically, persists audit, and deduplicates repeat statements", async () => {
    const { request, store } = setup();
    const body = { csv, accountId: "intesa" };
    const first = await (await request("/import/commit", "POST", body)).json();
    expect(first.imported).toBe(2);
    const next = await (await request("/import/commit", "POST", body)).json();
    expect(next.duplicates).toBe(2);
    expect(store.list("transactions")).toHaveLength(88);
    expect(store.audit()[0]).toMatchObject({
      action: "create",
      collection: "transactions",
    });
  });
  it("no partial import if a row is invalid", async () => {
    const { request, store } = setup();
    const before = store.list("transactions").length;
    expect(
      (
        await request("/import/commit", "POST", {
          csv: csv + "\n31/02/2026;bad;1,00;X",
          accountId: "intesa",
        })
      ).status,
    ).toBe(422);
    expect(store.list("transactions")).toHaveLength(before);
  });
  it("preserves repeated identical bank rows within the same file", async () => {
    const { request } = setup();
    const repeated =
      "date,description,amount\n2026-11-12,Same,1.00\n2026-11-12,Same,1.00";
    const result = await (
      await request("/import/commit", "POST", {
        csv: repeated,
        accountId: "intesa",
      })
    ).json();
    expect(result.imported).toBe(2);
  });
  it("escapes spreadsheet formulas in export text", () => {
    const s = exportCsv(
      [{ description: '=HYPERLINK("x")', amountMinor: -123 }],
      ["description", "amountMinor"],
    );
    expect(s).toContain("'=HYPERLINK");
    expect(s).toContain('"-123"');
  });
});

describe("interchange and canonical reporting regressions", () => {
  it("category can be explicitly cleared without losing transaction fields", async () => {
    const { request } = setup();
    const before = await (await request("/transactions/demo-tx-1")).json();
    expect(before.categoryId).toBeTruthy();
    const updated = await (
      await request("/transactions/demo-tx-1", "PATCH", { categoryId: null })
    ).json();
    expect(updated.categoryId).toBeUndefined();
    expect(updated.amountMinor).toBe(before.amountMinor);
  });
  it("conflicting external bank reference rejects the whole import", async () => {
    const { request, store } = setup();
    const csv =
      "date,description,amount,externalId\n2026-11-12,Original,10.00,bank-ref";
    expect(
      (await request("/import/commit", "POST", { csv, accountId: "intesa" }))
        .status,
    ).toBe(201);
    const count = store.list("transactions").length;
    const conflict = csv.replace("10.00", "11.00");
    expect(
      (
        await request("/import/commit", "POST", {
          csv: conflict,
          accountId: "intesa",
        })
      ).status,
    ).toBe(409);
    expect(store.list("transactions")).toHaveLength(count);
  });
  it("dashboard includes disabled account balances but excludes them from available cash", async () => {
    const { request } = setup();
    const before = await (await request("/dashboard")).json();
    const account = before.accounts.find((a: any) => a.id === "intesa");
    expect(
      (await request("/accounts/intesa", "PATCH", { enabled: false })).status,
    ).toBe(200);
    const after = await (await request("/dashboard")).json();
    expect(
      after.accounts.find((a: any) => a.id === "intesa").currentBalanceMinor,
    ).toBe(account.currentBalanceMinor);
    expect(after.balanceMinor).toBe(
      before.balanceMinor - account.currentBalanceMinor,
    );
    expect(after.accountCount).toBe(2);
  });
  it("global category catalog remains available within an entity context", async () => {
    const { request } = setup();
    const categories = await (
      await request("/categories?entityId=gb-tour")
    ).json();
    expect(categories.total).toBeGreaterThan(0);
  });
  it("source-derived defaults support a booking on a clean non-demo install", async () => {
    const store = new Store();
    stores.push(store);
    const app = createApp(store);
    const request = (kind: string, body: unknown) =>
      app(
        new Request("http://localhost/api/v1/" + kind, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    await request("entities", {
      id: "clean",
      name: "Clean Operator",
      currency: "EUR",
    });
    await request("accounts", {
      id: "clean-bank",
      entityId: "clean",
      name: "Operating",
      bank: "Example",
      currency: "EUR",
      balanceMinor: 0,
      asOfDate: "2026-10-31",
      enabled: true,
    });
    const result = await request("bookings", {
      entityId: "clean",
      accountId: "clean-bank",
      reference: "CLEAN-1",
      customer: "Example",
      destination: "Puglia",
      bookingDate: "2026-11-12",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      totalMinor: 100000,
      supplierName: "Hotel",
      supplierCostMinor: 70000,
    });
    expect(result.status).toBe(201);
    expect(store.list("obligations")).toHaveLength(4);
  });
});
