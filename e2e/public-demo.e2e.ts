import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = process.env.OPENTESORO_E2E_PUBLIC_URL ?? "http://127.0.0.1:4401";
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
}
test("public visitors can edit synthetic cash flows, export, and reset without sharing records", async ({
  page,
  context,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/movimenti`);
  await expect(
    page.getByText("Demo pubblica · Il tuo spazio di prova", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nuovo movimento", exact: true })
    .click();
  await page.getByLabel("Importo (€)", { exact: true }).fill("123,45");
  await page
    .getByLabel("Controparte", { exact: true })
    .fill("Visitatrice sintetica");
  await page
    .getByLabel("Descrizione", { exact: true })
    .fill("Prova isolamento pubblico");
  await page
    .getByRole("button", { name: "Registra movimento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByPlaceholder("Cerca controparte o descrizione...")
    .fill("Prova isolamento pubblico");
  await expect(
    page.getByRole("cell", {
      name: "Visitatrice sintetica Prova isolamento pubblico",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByPlaceholder("Cerca controparte o descrizione...")
    .fill("Prova isolamento pubblico");
  await expect(
    page.getByRole("cell", {
      name: "Visitatrice sintetica Prova isolamento pubblico",
      exact: true,
    }),
  ).toBeVisible();
  const cookie = (await context.cookies(origin)).find(
    (c) => c.name === "__Host-opentesoro-demo",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "__Host-opentesoro-demo",
  );
  const other = await browser.newContext();
  try {
    const visitor = await other.newPage();
    await visitor.goto(`${origin}/movimenti`);
    await visitor
      .getByPlaceholder("Cerca controparte o descrizione...")
      .fill("Prova isolamento pubblico");
    await expect(
      visitor.getByRole("cell", { name: /Visitatrice sintetica/ }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
  await page.goto(`${origin}/integrazioni`);
  await expect(
    page.getByText("Accesso API del workspace", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/Token API|Bearer token/i)).toHaveCount(0);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /Esporta.*JSON/ }).click();
  expect((await downloading).suggestedFilename()).toBe(
    "opentesoro-workspace.json",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page);
  await page
    .getByRole("button", { name: "Ripristina demo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Ogni decisione parte dalla chiarezza.",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${origin}/movimenti`);
  await page
    .getByPlaceholder("Cerca controparte o descrizione...")
    .fill("Prova isolamento pubblico");
  await expect(
    page.getByRole("cell", { name: /Visitatrice sintetica/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("invalid sessions require an explicit restart and another tab reset requires a reload", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "__Host-opentesoro-demo",
      value: "x".repeat(43),
      url: origin.replace("http:", "https:"),
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.goto(origin);
  await expect(
    page.getByText("La sessione demo è terminata", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Avvia nuova demo", exact: true })
    .click();
  await expect(
    page.getByText("Demo pubblica · Il tuo spazio di prova", { exact: true }),
  ).toBeVisible();
  const tab = await context.newPage();
  await tab.goto(origin);
  await expect(
    tab.getByRole("button", { name: "Ripristina demo", exact: true }),
  ).toBeVisible();
  await tab
    .getByRole("button", { name: "Ripristina demo", exact: true })
    .click();
  await expect(
    tab.getByRole("heading", {
      name: "Ogni decisione parte dalla chiarezza.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aggiorna dati", exact: true })
    .click();
  await expect(
    page.getByText("La demo è cambiata in un’altra scheda", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ricarica workspace", exact: true })
    .click();
  await expect(
    page.getByText("Demo pubblica · Il tuo spazio di prova", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Ogni decisione parte dalla chiarezza.",
      exact: true,
    }),
  ).toBeVisible();
  await accessible(page);
  await tab.close();
});
