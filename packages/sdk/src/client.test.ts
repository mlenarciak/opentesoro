import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type AppOptions } from "../../../apps/server/src/app";
import { Store } from "../../../apps/server/src/store";
import {
  ApiError,
  OpenTesoroClient,
  type Account,
  type Bootstrap,
  type Entity,
  type Forecast,
  type Transaction,
} from "./index";
const stores = new Set<Store>();
const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const store of stores) store.close();
  stores.clear();
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture(options: AppOptions = {}, path = ":memory:") {
  const store = new Store(path);
  stores.add(store);
  const handle = createApp(store, options);
  const injectedFetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => handle(new Request(input, init))) as typeof fetch;
  return {
    store,
    client: new OpenTesoroClient({
      baseUrl: "http://opentesoro.test/",
      fetch: injectedFetch,
    }),
    clientWithToken: (token?: string) =>
      new OpenTesoroClient({
        baseUrl: "http://opentesoro.test",
        fetch: injectedFetch,
        token,
      }),
  };
}
async function entityAndAccount(client: OpenTesoroClient) {
  const entity: Entity = await client.create("entities", {
    id: "operator",
    name: "Synthetic tour operator",
    currency: "EUR",
  });
  const account: Account = await client.create("accounts", {
    id: "bank",
    entityId: entity.id,
    name: "Operating account",
    bank: "Synthetic bank",
    currency: "EUR",
    balanceMinor: 100_000,
    asOfDate: "2026-01-31",
    enabled: true,
  });
  return { entity, account };
}
const transaction = (id = "receipt") => ({
  id,
  entityId: "operator",
  accountId: "bank",
  date: "2026-02-02",
  amountMinor: 20_000,
  description: "Bonifico cliente OT-001",
  counterparty: "Synthetic customer",
});
const obligation = (id = "balance") => ({
  id,
  entityId: "operator",
  accountId: "bank",
  dueDate: "2026-02-03",
  amountMinor: 50_000,
  settledMinor: 0,
  description: "Saldo viaggio OT-001",
  counterparty: "Synthetic customer",
  status: "open" as const,
});
const horizon = {
  from: "2026-02-01",
  to: "2026-02-28",
  granularity: "week" as const,
};
describe("fetch-only SDK against actual Bun request handler", () => {
  test("typed bootstrap and entity/account creation round-trip", async () => {
    const { client } = fixture();
    const initial: Bootstrap = await client.bootstrap();
    expect(initial.entities).toHaveLength(0);
    expect(initial.accounts).toHaveLength(0);
    const { entity, account } = await entityAndAccount(client);
    expect(entity.currency).toBe("EUR");
    expect(account.balanceMinor).toBe(100_000);
    const after: Bootstrap = await client.bootstrap();
    expect(after.entities[0]?.id).toBe(entity.id);
    expect(after.accounts[0]?.id).toBe(account.id);
    expect(after.revision).toBeGreaterThan(initial.revision);
  });
  test("transaction filters, pagination, mutation and delete", async () => {
    const { client } = fixture();
    await entityAndAccount(client);
    const receipt: Transaction = await client.create(
      "transactions",
      transaction(),
    );
    await client.create("transactions", {
      ...transaction("supplier"),
      amountMinor: -12_000,
      description: "Pagamento hotel",
      counterparty: "Synthetic supplier",
    });
    const page = await client.list("transactions", {
      entityId: "operator",
      accountId: "bank",
      direction: "inflow",
      search: "bonifico",
      limit: 1,
      offset: 0,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(receipt.id);
    expect(page.limit).toBe(1);
    const patched = await client.update("transactions", receipt.id, {
      description: "Bonifico aggiornato",
    });
    expect(patched.description).toBe("Bonifico aggiornato");
    expect((await client.get("transactions", receipt.id)).description).toBe(
      patched.description,
    );
    await client.remove("transactions", receipt.id);
    expect((await client.list("transactions")).total).toBe(1);
  });
  test("forecast reflects mutations and avoids double counting partial settlements", async () => {
    const { client } = fixture();
    await entityAndAccount(client);
    const initial: Forecast = await client.forecast(horizon);
    expect(initial.closingBalanceMinor).toBe(100_000);
    await client.create("transactions", transaction());
    await client.create("obligations", obligation());
    const settlement = await client.reconcile({
      transactionId: "receipt",
      obligationId: "balance",
      amountMinor: 20_000,
    });
    expect(settlement.obligation.status).toBe("partial");
    const result: Forecast = await client.forecast(horizon);
    expect(result.closingBalanceMinor).toBe(150_000);
    expect(result.totalInflowMinor).toBe(50_000);
    expect(result.periods).toHaveLength(5);
    const cached = await client.forecast(horizon);
    expect(cached).toEqual(result);
    await client.create("transactions", {
      ...transaction("expense"),
      amountMinor: -5000,
    });
    expect((await client.forecast(horizon)).closingBalanceMinor).toBe(145_000);
  });
  test("structured 404 errors carry status, detail and request identity", async () => {
    const { client } = fixture();
    try {
      await client.get("entities", "missing");
      throw new Error("Expected API rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.status).toBe(404);
      expect(apiError.detail).toContain("not found");
      expect(apiError.requestId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
  test("authentication and read-only role propagate through SDK", async () => {
    const { client, clientWithToken } = fixture({
      token: "writer-token-for-sdk-fixture-123",
      readOnlyToken: "reader-token-for-sdk-fixture-123",
    });
    await expect(client.bootstrap()).rejects.toMatchObject({ status: 401 });
    const writer = clientWithToken("writer-token-for-sdk-fixture-123");
    await entityAndAccount(writer);
    const reader = clientWithToken("reader-token-for-sdk-fixture-123");
    expect((await reader.bootstrap()).entities).toHaveLength(1);
    await expect(
      reader.create("entities", { name: "Forbidden", currency: "EUR" }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await writer.list("entities")).total).toBe(1);
  });
  test("idempotency replay returns the original record without duplicate financial writes", async () => {
    const { client } = fixture();
    await entityAndAccount(client);
    const body = transaction("stable-id");
    const first = await client.create("transactions", body, "import-receipt-1");
    const second = await client.create(
      "transactions",
      body,
      "import-receipt-1",
    );
    expect(second).toEqual(first);
    expect((await client.list("transactions")).total).toBe(1);
    await expect(
      client.create(
        "transactions",
        { ...body, amountMinor: 30_000 },
        "import-receipt-1",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  test("reserved characters in record IDs survive SDK path encoding", async () => {
    const { client } = fixture();
    await entityAndAccount(client);
    const id = "booking:deposit / città";
    await client.create("obligations", obligation(id));
    expect((await client.get("obligations", id)).id).toBe(id);
    expect(
      (
        await client.update("obligations", id, {
          description: "Updated installment",
        })
      ).description,
    ).toBe("Updated installment");
    await client.remove("obligations", id);
    await expect(client.get("obligations", id)).rejects.toMatchObject({
      status: 404,
    });
  });
  test("Italian CSV preview and commit remain idempotent through SDK", async () => {
    const { client } = fixture();
    await entityAndAccount(client);
    const csv =
      "date;description;amount;counterparty;externalId\n2026-02-02;Acconto viaggio;1.234,56;Synthetic customer;bank-ext-1";
    const preview = await client.previewImport(csv);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]?.amountMinor).toBe(123456);
    expect((await client.commitImport(csv, "bank")).imported).toBe(1);
    expect((await client.commitImport(csv, "bank")).duplicates).toBe(1);
    expect((await client.list("transactions")).total).toBe(1);
  });
  test("SQLite close and reopen preserves records, settlement ledger, revision and forecast", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "opentesoro-sdk-persistence-"),
    );
    temporaryDirectories.push(directory);
    const path = join(directory, "treasury.sqlite");
    const first = fixture({}, path);
    await entityAndAccount(first.client);
    await first.client.create("transactions", transaction());
    await first.client.create("obligations", obligation());
    await first.client.reconcile({
      transactionId: "receipt",
      obligationId: "balance",
      amountMinor: 20_000,
    });
    const before = await first.client.forecast(horizon),
      revision = first.store.revision();
    first.store.close();
    stores.delete(first.store);
    const reopened = fixture({}, path);
    expect(reopened.store.revision()).toBe(revision);
    expect(
      (await reopened.client.get("obligations", "balance")).settledMinor,
    ).toBe(20_000);
    expect((await reopened.client.list("settlements")).total).toBe(1);
    expect(await reopened.client.forecast(horizon)).toEqual(before);
  });
});
