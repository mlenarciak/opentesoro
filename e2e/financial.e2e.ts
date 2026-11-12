import { test, expect, type APIRequestContext } from "@playwright/test";
import type {
  Account,
  Bootstrap,
  Obligation,
  Transaction,
  Booking,
} from "@opentesoro/sdk";

async function create<T>(
  request: APIRequestContext,
  collection: string,
  body: unknown,
): Promise<T> {
  const response = await request.post(`/api/v1/${collection}`, { data: body });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

test("reconcile a partial payment using searchable unallocated cash, then reset the selection", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const prefix = `E2E-reconcile-${suffix}`;
  const bootstrap: Bootstrap = await (
    await request.get("/api/v1/bootstrap")
  ).json();
  const account = bootstrap.accounts[0]!;
  const other = await create<Account>(request, "accounts", {
    entityId: account.entityId,
    name: `${prefix} other account`,
    bank: "Fixture bank",
    currency: "EUR",
    balanceMinor: 0,
    asOfDate: "2026-10-31",
    enabled: true,
  });
  const obligation = await create<Obligation>(request, "obligations", {
    entityId: account.entityId,
    accountId: account.id,
    dueDate: "2026-11-12",
    amountMinor: 10001,
    description: `${prefix} target`,
    counterparty: prefix,
    settledMinor: 0,
    status: "open",
  });
  const sibling = await create<Obligation>(request, "obligations", {
    entityId: account.entityId,
    accountId: account.id,
    dueDate: "2026-11-12",
    amountMinor: 5000,
    description: `${prefix} prior allocation`,
    counterparty: prefix,
    settledMinor: 0,
    status: "open",
  });
  const tx = (
    name: string,
    accountId = account.id,
    amountMinor = 7001,
    transferId?: string,
  ) =>
    create<Transaction>(request, "transactions", {
      entityId: account.entityId,
      accountId,
      date: "2026-11-12",
      amountMinor,
      description: `${prefix} ${name}`,
      counterparty: `${prefix} ${name}`,
      transferId,
    });
  const available = await tx("available");
  const full = await tx("fully allocated", account.id, 4000);
  await tx("wrong account", other.id);
  await tx("internal transfer", account.id, 7001, `${prefix}-transfer`);
  expect(
    (
      await request.post("/api/v1/reconciliation", {
        data: {
          transactionId: available.id,
          obligationId: sibling.id,
          amountMinor: 1000,
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.post("/api/v1/reconciliation", {
        data: {
          transactionId: full.id,
          obligationId: sibling.id,
          amountMinor: 4000,
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/scadenze");
  await page
    .getByPlaceholder("Cerca controparte o scadenza...")
    .fill(`${prefix} target`);
  await page.getByRole("button", { name: "Riconcilia", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cerca movimento da riconciliare").fill(prefix);
  await dialog
    .getByRole("combobox", { name: "Movimento da riconciliare" })
    .click();
  await expect(
    page.getByRole("option", { name: new RegExp(`${prefix} available`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", {
      name: /fully allocated|wrong account|internal transfer/,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: new RegExp(`${prefix} available`) })
    .click();
  await expect(dialog.getByLabel("Importo da riconciliare (€)")).toHaveValue(
    "60.01",
  );
  await expect(dialog.getByText(/Proposta verificata:/)).toBeVisible();
  await dialog.getByLabel("Importo da riconciliare (€)").fill("25,05");
  await dialog
    .getByRole("button", { name: "Conferma riconciliazione", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const updated: Obligation = await (
    await request.get(`/api/v1/obligations/${obligation.id}`)
  ).json();
  expect(updated.settledMinor).toBe(2505);
  expect(updated.status).toBe("partial");
  await page.getByRole("button", { name: "Riconcilia", exact: true }).click();
  await expect(
    dialog.getByRole("combobox", { name: "Movimento da riconciliare" }),
  ).toContainText("Seleziona un movimento");
  await expect(dialog.getByLabel("Importo da riconciliare (€)")).toHaveValue(
    "",
  );
  await dialog.getByLabel("Cerca movimento da riconciliare").fill(prefix);
  await dialog
    .getByRole("combobox", { name: "Movimento da riconciliare" })
    .click();
  await page
    .getByRole("option", { name: new RegExp(`${prefix} available`) })
    .click();
  await expect(dialog.getByLabel("Importo da riconciliare (€)")).toHaveValue(
    "34.96",
  );
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
});

test("create a booking through the UI and persist its exact customer and supplier schedules", async ({
  page,
  request,
}) => {
  const reference = `E2E-booking-${crypto.randomUUID().slice(0, 8)}`;
  await page.goto("/prenotazioni");
  await page
    .getByRole("button", { name: "Nuova prenotazione", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Riferimento pratica").fill(reference);
  await dialog.getByLabel("Cliente", { exact: true }).fill("E2E Family");
  await dialog
    .getByLabel("Destinazione", { exact: true })
    .fill("Sicilia · E2E");
  await dialog.getByLabel("Data conferma").fill("2026-11-12");
  await dialog.getByLabel("Partenza", { exact: true }).fill("2027-02-15");
  await dialog.getByLabel("Rientro", { exact: true }).fill("2027-02-22");
  await dialog.getByLabel("Valore vendita (€)").fill("1234,57");
  await dialog.getByLabel("Acconto cliente (%)").fill("30");
  await dialog.getByLabel("Fornitore principale").fill("E2E Hotel");
  await dialog.getByLabel("Costo fornitore (€)").fill("800,03");
  await dialog.getByLabel("Acconto fornitore (%)").fill("20");
  await dialog
    .getByRole("button", { name: "Crea prenotazione e scadenze", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByPlaceholder("Cerca riferimento, cliente o destinazione...")
    .fill(reference);
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  const bootstrap: Bootstrap = await (
    await request.get("/api/v1/bootstrap")
  ).json();
  const booking: Booking | undefined = bootstrap.bookings.find(
    (b) => b.reference === reference,
  );
  expect(booking).toBeDefined();
  expect(booking!.totalMinor).toBe(123457);
  expect(booking!.supplierCostMinor).toBe(80003);
  const obligations = bootstrap.obligations.filter(
    (o) => o.bookingId === booking!.id,
  );
  expect(obligations).toHaveLength(4);
  const receipts = obligations.filter((o) => o.amountMinor > 0);
  const payments = obligations.filter((o) => o.amountMinor < 0);
  expect(receipts.map((o) => o.amountMinor).sort((a, b) => a - b)).toEqual([
    37037, 86420,
  ]);
  expect(payments.reduce((s, o) => s + o.amountMinor, 0)).toBe(-80003);
  expect(receipts.find((o) => o.amountMinor === 86420)!.dueDate).toBe(
    "2027-01-16",
  );
  await page.reload();
  await page
    .getByPlaceholder("Cerca riferimento, cliente o destinazione...")
    .fill(reference);
  await page
    .getByRole("button", { name: `Dettagli ${reference}`, exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("row")).toHaveCount(5);
});
