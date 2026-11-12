import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((node) => ({
        target: node.target,
        reason: node.failureSummary,
      })),
    })),
  ).toEqual([]);
}
async function palette(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const rgb = (token: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = style.getPropertyValue(token).trim();
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    return {
      primary: rgb("--primary"),
      chart: rgb("--chart-1"),
      positive: rgb("--positive"),
      negative: rgb("--negative"),
      font: getComputedStyle(document.body).fontFamily,
      radius: style.getPropertyValue("--radius").trim(),
    };
  });
}

test("blue square theme persists across reloads and keeps financial colors distinct", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Vai al contenuto" }),
  ).toBeFocused();
  await page.getByRole("heading", { level: 1 }).click();
  const light = await palette(page);
  expect(light.font).toContain("Geist Variable");
  expect(light.radius).toBe("0");
  expect(light.primary[2]).toBeGreaterThan(light.primary[0]!);
  expect(light.primary[2]).toBeGreaterThan(light.primary[1]!);
  expect(light.chart[2]).toBeGreaterThan(light.chart[0]!);
  expect(light.positive[1]).toBeGreaterThan(light.positive[0]!);
  expect(light.negative[0]).toBeGreaterThan(light.negative[1]!);
  const corners = await page
    .locator(
      '[data-slot="button"], [data-slot="card"], [data-slot="select-trigger"], [data-slot="badge"]',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).borderTopLeftRadius),
    );
  expect(corners.length).toBeGreaterThan(5);
  expect(corners.every((corner) => corner === "0px")).toBe(true);
  await accessible(page);
  await page.screenshot({
    path: "test-results/opentesoro-blue-desktop-light.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Attiva tema scuro", exact: true })
    .click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(() => localStorage.getItem("opentesoro.theme")),
  ).toBe("dark");
  const dark = await palette(page);
  expect(dark.primary[2]).toBeGreaterThan(dark.primary[0]!);
  expect(dark.chart[2]).toBeGreaterThan(dark.chart[0]!);
  expect(dark.positive[1]).toBeGreaterThan(dark.positive[0]!);
  expect(dark.negative[0]).toBeGreaterThan(dark.negative[1]!);
  await accessible(page);
  await page.screenshot({
    path: "test-results/opentesoro-blue-desktop-dark.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Attiva tema chiaro", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .getByRole("button", { name: "Attiva tema chiaro", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("mobile menu traps keyboard focus, closes with Escape and restores its trigger", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const trigger = page.getByRole("button", { name: "Apri menu", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", {
    name: "Menu di navigazione",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await accessible(page);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await menu.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(
    await menu.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: /^Scadenziario/ }).click();
  await expect(menu).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Scadenziario", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page);
  await page.screenshot({
    path: "test-results/opentesoro-blue-mobile-light.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Attiva tema scuro", exact: true })
    .click();
  await accessible(page);
  await page.screenshot({
    path: "test-results/opentesoro-blue-mobile-dark.png",
    fullPage: false,
  });
});

test("dark transaction form remains accessible without changing its financial workflow", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/movimenti");
  await expect(
    page.getByRole("button", { name: "Nuovo movimento", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .getByRole("button", { name: "Nuovo movimento", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Importo (€)", { exact: true }).fill("1250,00");
  await accessible(page);
  const inputs = await dialog
    .locator("input")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).borderTopLeftRadius),
    );
  expect(inputs.every((radius) => radius === "0px")).toBe(true);
  await page.screenshot({
    path: "test-results/opentesoro-blue-dark-transaction-form.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
