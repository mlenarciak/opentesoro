/** Reproducible local API benchmark; synthetic data only. No listening port or network. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, cpus, totalmem } from "node:os";
import { join } from "node:path";
import { Store, type RecordData } from "../apps/server/src/store";
import { createApp } from "../apps/server/src/app";

const directory = mkdtempSync(join(tmpdir(), "opentesoro-api-benchmark-"));
const store = new Store(join(directory, "benchmark.sqlite"));
const transactionCount = 100_000,
  obligationCount = 10_000;
interface Measurement {
  wallMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
}
const round = (number: number) => Number(number.toFixed(2));
async function measure<T>(
  work: () => T | Promise<T>,
): Promise<{ value: T; measurement: Measurement }> {
  const cpu = process.cpuUsage(),
    start = performance.now();
  const value = await work();
  const elapsed = process.cpuUsage(cpu);
  return {
    value,
    measurement: {
      wallMs: round(performance.now() - start),
      cpuUserMs: round(elapsed.user / 1000),
      cpuSystemMs: round(elapsed.system / 1000),
    },
  };
}
function summarize(samples: Measurement[]) {
  const sorted = samples.map((x) => x.wallMs).sort((a, b) => a - b);
  return { samples, medianWallMs: sorted[Math.floor(sorted.length / 2)]! };
}
const forecastUrl =
  "http://benchmark.local/api/v1/forecast?from=2026-11-01&to=2027-10-31&granularity=week";
async function readJson(
  handler: ReturnType<typeof createApp>,
  url: string,
): Promise<Record<string, unknown>> {
  const response = await handler(new Request(url));
  if (!response.ok)
    throw new Error(
      `Benchmark API failed (${response.status}): ${await response.text()}`,
    );
  return (await response.json()) as Record<string, unknown>;
}
try {
  const fixture = await measure(() =>
    store.atomic(() => {
      store.put(
        "entities",
        { id: "operator", name: "Synthetic operator", currency: "EUR" },
        "benchmark",
      );
      for (const [id, name, direction] of [
        ["customer-receipts", "Customer receipts", "inflow"],
        ["supplier-payments", "Supplier payments", "outflow"],
      ] as const)
        store.put("categories", { id, name, direction }, "benchmark");
      for (let a = 0; a < 4; a++)
        store.put(
          "accounts",
          {
            id: `account-${a}`,
            entityId: "operator",
            name: `Synthetic account ${a}`,
            bank: "Synthetic",
            currency: "EUR",
            balanceMinor: 12_500_000,
            asOfDate: "2026-10-31",
            enabled: true,
          },
          "benchmark",
        );
      for (let i = 0; i < transactionCount; i++) {
        const positive = i % 2 === 0;
        store.put(
          "transactions",
          {
            id: `transaction-${String(i).padStart(6, "0")}`,
            entityId: "operator",
            accountId: `account-${i % 4}`,
            date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
            amountMinor: positive ? 10_000 : -8_000,
            description: `Synthetic ${positive ? "customer booking receipt" : "hotel supplier payment"}`,
            counterparty: positive ? "Synthetic customer" : "Synthetic hotel",
            categoryId: positive ? "customer-receipts" : "supplier-payments",
            externalId: `synthetic-bank-${i}`,
          } satisfies RecordData,
          "benchmark",
        );
      }
      for (let i = 0; i < obligationCount; i++) {
        const positive = i % 2 === 0;
        store.put(
          "obligations",
          {
            id: `obligation-${String(i).padStart(6, "0")}`,
            entityId: "operator",
            accountId: `account-${i % 4}`,
            dueDate: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`,
            amountMinor: positive ? 15_000 : -12_000,
            settledMinor: 0,
            description: positive
              ? "Synthetic customer balance"
              : "Synthetic supplier balance",
            counterparty: positive ? "Synthetic customer" : "Synthetic hotel",
            categoryId: positive ? "customer-receipts" : "supplier-payments",
            status: "open",
          } satisfies RecordData,
          "benchmark",
        );
      }
    }),
  );
  // Every uncached sample uses a new application cache; SQLite/OS pages remain warm after seeding.
  const uncached: Measurement[] = [];
  let checksum: Record<string, unknown> = {};
  for (let i = 0; i < 5; i++) {
    const handler = createApp(store);
    const result = await measure(() => readJson(handler, forecastUrl));
    uncached.push(result.measurement);
    checksum = {
      closingBalanceMinor: result.value.closingBalanceMinor,
      totalInflowMinor: result.value.totalInflowMinor,
      totalOutflowMinor: result.value.totalOutflowMinor,
      periodCount: (result.value.periods as unknown[]).length,
    };
  }
  const cachedHandler = createApp(store);
  await readJson(cachedHandler, forecastUrl);
  const cached: Measurement[] = [];
  for (let i = 0; i < 5; i++)
    cached.push(
      (await measure(() => readJson(cachedHandler, forecastUrl))).measurement,
    );
  const pageHandler = createApp(store);
  const page: Measurement[] = [],
    searchPage: Measurement[] = [];
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const result = await measure(() =>
      readJson(
        pageHandler,
        "http://benchmark.local/api/v1/transactions?limit=100&offset=0",
      ),
    );
    page.push(result.measurement);
    total = Number(result.value.total);
  }
  for (let i = 0; i < 5; i++)
    searchPage.push(
      (
        await measure(() =>
          readJson(
            pageHandler,
            "http://benchmark.local/api/v1/transactions?limit=100&offset=0&search=customer&direction=inflow",
          ),
        )
      ).measurement,
    );
  console.log(
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        runtime: `Bun ${Bun.version}`,
        platform: `${process.platform}/${process.arch}`,
        cpuModel: cpus()[0]?.model,
        logicalCpuCount: cpus().length,
        hostRamGiB: round(totalmem() / 1024 ** 3),
        dataset: {
          transactions: transactionCount,
          obligations: obligationCount,
          accounts: 4,
          forecastDays: 365,
          currency: "EUR",
          sqlite: "temporary on-disk database, WAL enabled",
          audit: "Store.put audit and revision tracking enabled during seed",
        },
        fixtureCreation: fixture.measurement,
        uncachedForecastIncludingSQLiteEngineJson: summarize(uncached),
        cachedForecastIncludingJson: summarize(cached),
        transactionPage100IncludingCountAndJson: summarize(page),
        searchedTransactionPage100IncludingCountAndJson: summarize(searchPage),
        peakProcessRssMiB: round(process.resourceUsage().maxRSS / 1024),
        resultChecksum: { ...checksum, transactionPageTotal: total },
        scope:
          "In-process createApp request handler with actual SQLite reads, engine calculations, JSON response encoding and JSON parsing. Excludes HTTP socket/TLS/network transport and browser/UI. Uncached means fresh application cache, NOT cold OS or SQLite page caches. RSS is process lifetime peak including fixtures, audit records, JIT and five uncached runs. No comparison with Agicap or other products.",
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
