import { test, expect } from "@playwright/test";

test("all treasury views render without application errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title] of [
    ["/", "La tua liquidità, senza sorprese."],
    ["/movimenti", "Movimenti"],
    ["/previsioni", "Piano di tesoreria"],
    ["/scadenze", "Scadenziario"],
    ["/prenotazioni", "Viaggi e prenotazioni"],
    ["/conti", "Conti e società"],
    ["/integrazioni", "Importa e integra"],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (path !== "/")
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
    await expect(
      page.getByText("Non è stato possibile caricare i dati"),
    ).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("create a transaction, search it, and keep it after reload", async ({
  page,
  request,
}) => {
  await page.goto("/movimenti");
  await page.getByRole("button", { name: "Nuovo movimento" }).click();
  await page.getByLabel("Importo (€)", { exact: true }).fill("1234,56");
  await page.getByLabel("Controparte", { exact: true }).fill("E2E Cliente");
  await page
    .getByLabel("Descrizione", { exact: true })
    .fill("E2E acconto viaggio");
  await page
    .getByRole("button", { name: "Registra movimento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByPlaceholder("Cerca controparte o descrizione...")
    .fill("E2E acconto viaggio");
  await expect(
    page.getByRole("cell", {
      name: "E2E Cliente E2E acconto viaggio",
      exact: true,
    }),
  ).toBeVisible();
  const r = await request.get("/api/v1/transactions?search=E2E%20acconto");
  expect((await r.json()).items[0].amountMinor).toBe(123456);
  await page.reload();
  await page
    .getByPlaceholder("Cerca controparte o descrizione...")
    .fill("E2E acconto viaggio");
  await expect(
    page.getByRole("cell", {
      name: "E2E Cliente E2E acconto viaggio",
      exact: true,
    }),
  ).toBeVisible();
});

test("switch scenario and aggregate weekly without losing forecast", async ({
  page,
}) => {
  await page.goto("/previsioni");
  await expect(
    page.getByRole("heading", { name: "Piano di tesoreria", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Scenario di previsione" }).click();
  await page
    .getByRole("option", { name: "Prudente · incassi +15 giorni" })
    .click();
  await expect(page.getByText(/Ipotesi dello scenario/)).toBeVisible();
  await page.getByRole("radio", { name: "Settimane", exact: true }).click();
  await expect(
    page.getByText("Il piano, numero per numero", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Non è stato possibile caricare i dati"),
  ).toHaveCount(0);
});

test("CSV preview and confirmed import persist exact minor units", async ({
  page,
  request,
}) => {
  await page.goto("/integrazioni");
  await page
    .getByLabel("Contenuto CSV")
    .fill(
      "data;descrizione;importo;controparte\n12/11/2026;E2E CSV acconto;345,67;E2E Import",
    );
  await page
    .getByRole("button", { name: /Valida|anteprima|Analizza/i })
    .click();
  await page
    .getByRole("button", { name: "Conferma importazione", exact: true })
    .click();
  await expect(
    page
      .getByText(/Importazione completata|movimenti importati|Importati/i)
      .first(),
  ).toBeVisible();
  const result = await (
    await request.get("/api/v1/transactions?search=E2E%20CSV")
  ).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0].amountMinor).toBe(34567);
});

test("empty standalone installation can create its company and opening account", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4400/conti");
  await page
    .getByRole("button", { name: "Nuova società", exact: true })
    .click();
  await page.getByLabel("Ragione sociale").fill("E2E Tour Operator S.r.l.");
  await page.getByRole("button", { name: "Crea società", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: /Aggiungi conto|Nuovo conto/, exact: true })
    .first()
    .click();
  await page.getByLabel("Nome conto").fill("E2E Conto operativo");
  await page.getByLabel("Banca", { exact: true }).fill("Banca di prova");
  await page.getByLabel("Saldo di riferimento (€)").fill("10000,00");
  await page.getByLabel("Alla data").fill("2026-10-31");
  await page
    .getByRole("button", { name: "Aggiungi conto", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("E2E Conto operativo", { exact: true }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:4400/previsioni");
  await expect(
    page.getByText("Il piano, numero per numero", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Piano di tesoreria", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Non è stato possibile caricare i dati"),
  ).toHaveCount(0);
});

test("mobile navigation remains usable without page horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Apri menu", exact: true }).click();
  await page.getByRole("link", { name: "Scadenziario" }).click();
  await expect(
    page.getByRole("heading", { name: "Scadenziario", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
