import { buildForecast } from "./src/index";
import type { Account, Transaction, Obligation } from "./src/index";
const count = 100_000;
const accounts: Account[] = [
  {
    id: "a",
    entityId: "company",
    name: "Operating",
    bank: "Synthetic",
    currency: "EUR",
    balanceMinor: 50_000_000,
    asOfDate: "2026-01-31",
    enabled: true,
  },
];
const transactions: Transaction[] = Array.from({ length: count }, (_, i) => ({
  id: `t${i}`,
  entityId: "company",
  accountId: "a",
  date: `2026-02-${String((i % 28) + 1).padStart(2, "0")}`,
  amountMinor: i % 2 === 0 ? 10000 : -8000,
  description: "Synthetic booking settlement",
  counterparty: "Synthetic",
  categoryId: i % 2 === 0 ? "receipts" : "suppliers",
}));
const obligations: Obligation[] = Array.from({ length: 10_000 }, (_, i) => ({
  id: `o${i}`,
  entityId: "company",
  accountId: "a",
  dueDate: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
  amountMinor: i % 2 === 0 ? 15000 : -12000,
  settledMinor: 0,
  description: "Synthetic expected cash",
  counterparty: "Synthetic",
  status: "open",
}));
const run = () =>
  buildForecast({
    accounts,
    transactions,
    obligations,
    from: "2026-02-01",
    to: "2027-01-31",
    granularity: "week",
  });
run();
const timings: number[] = [];
let result = run();
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  result = run();
  timings.push(performance.now() - start);
}
const sorted = [...timings].sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      runtime: Bun.version,
      platform: `${process.platform}/${process.arch}`,
      transactions: count,
      obligations: obligations.length,
      horizonDays: 365,
      buckets: result.periods.length,
      runsMs: timings.map((t) => Number(t.toFixed(2))),
      medianMs: Number(sorted[2]!.toFixed(2)),
      peakRssMiB: Number((process.resourceUsage().maxRSS / 1024).toFixed(2)),
      closingBalanceMinor: result.closingBalanceMinor,
      scope:
        "In-process synthetic engine only; excludes database reads, network, serialization, UI, and fixture generation.",
    },
    null,
    2,
  ),
);
