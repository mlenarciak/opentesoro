import { addDays, assertDate, dateRange, periodKey } from "./dates";
import {
  addMinor,
  applyBasisPoints,
  assertCurrency,
  assertMinor,
} from "./money";
import { remainingMinor } from "./obligations";
import type {
  Forecast,
  ForecastCategory,
  ForecastInput,
  ForecastPeriod,
  Transaction,
} from "./types";

export function buildForecast(input: ForecastInput): Forecast {
  const { from, to } = input;
  assertDate(from);
  assertDate(to);
  const dates = dateRange(from, to);
  const selected = input.accounts.filter(
    (a) =>
      a.enabled &&
      (!input.entityIds || input.entityIds.includes(a.entityId)) &&
      (!input.accountIds || input.accountIds.includes(a.id)),
  );
  const accounts = new Map(selected.map((a) => [a.id, a]));
  const selectedEntities = new Set(selected.map((a) => a.entityId));
  if (accounts.size !== selected.length)
    throw new TypeError("Duplicate account IDs");
  const allAccounts = new Map(input.accounts.map((a) => [a.id, a]));
  if (allAccounts.size !== input.accounts.length)
    throw new TypeError("Duplicate account IDs");
  const currencies = new Set(selected.map((a) => a.currency));
  if (currencies.size > 1)
    throw new RangeError(
      "Mixed currencies cannot be consolidated without explicit FX conversion",
    );
  const currency = selected[0]?.currency ?? "EUR";
  assertCurrency(currency);
  let opening = 0;
  for (const a of selected) {
    assertDate(a.asOfDate);
    assertMinor(a.balanceMinor);
    if (a.asOfDate >= from)
      throw new RangeError(
        `Forecast must begin after account ${a.id}'s closing snapshot ${a.asOfDate}`,
      );
    opening = addMinor(opening, a.balanceMinor);
  }
  const scenario = input.scenario;
  if (scenario) {
    for (const value of [
      scenario.inflowBasisPoints,
      scenario.outflowBasisPoints,
    ])
      if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError(
          "Scenario basis points must be nonnegative integers",
        );
    for (const value of [scenario.inflowDelayDays, scenario.outflowDelayDays])
      if (!Number.isSafeInteger(value) || Math.abs(value) > 3660)
        throw new RangeError(
          "Scenario delays must be integers within 3660 days",
        );
  }
  const dayFlows = new Map<string, { actual: number[]; expected: number[] }>();
  const categories = new Map<string, ForecastCategory>();
  const categoryAdd = (id: string | undefined, value: number) => {
    const key = id ?? "uncategorized";
    const category = categories.get(key) ?? {
      categoryId: key,
      inflowMinor: 0,
      outflowMinor: 0,
      netMinor: 0,
    };
    if (value >= 0)
      category.inflowMinor = addMinor(category.inflowMinor, value);
    else category.outflowMinor = addMinor(category.outflowMinor, -value);
    category.netMinor = addMinor(category.inflowMinor, -category.outflowMinor);
    categories.set(key, category);
  };
  const add = (
    date: string,
    value: number,
    kind: "actual" | "expected",
    categoryId?: string,
  ) => {
    if (date < from || date > to) return;
    const flows = dayFlows.get(date) ?? { actual: [], expected: [] };
    flows[kind].push(value);
    dayFlows.set(date, flows);
    categoryAdd(categoryId, value);
  };
  // Fully observed same-day pairs are cash-neutral within the selected perimeter.
  // A one-sided/account-filtered transfer is a real flow for that perimeter.
  const transferGroups = new Map<string, Transaction[]>();
  for (const tx of input.transactions) {
    if (tx.transferId && accounts.has(tx.accountId)) {
      const group = transferGroups.get(tx.transferId) ?? [];
      group.push(tx);
      transferGroups.set(tx.transferId, group);
    }
  }
  const excludedTransfers = new Set<string>();
  for (const group of transferGroups.values()) {
    if (group.length !== 2) continue;
    const [a, b] = group;
    if (
      a &&
      b &&
      a.accountId !== b.accountId &&
      a.date === b.date &&
      addMinor(a.amountMinor, b.amountMinor) === 0 &&
      a.date > accounts.get(a.accountId)!.asOfDate &&
      b.date > accounts.get(b.accountId)!.asOfDate
    ) {
      excludedTransfers.add(a.id);
      excludedTransfers.add(b.id);
    }
  }
  const transactionIds = new Set<string>();
  for (const tx of input.transactions) {
    if (transactionIds.has(tx.id))
      throw new TypeError(`Duplicate transaction ID ${tx.id}`);
    transactionIds.add(tx.id);
    if (!allAccounts.has(tx.accountId))
      throw new TypeError(`Unknown transaction account ${tx.accountId}`);
    const account = accounts.get(tx.accountId);
    if (!account) continue;
    if (tx.entityId !== account.entityId)
      throw new TypeError("Transaction entity does not match account");
    assertDate(tx.date);
    assertMinor(tx.amountMinor);
    if (tx.date <= account.asOfDate || excludedTransfers.has(tx.id)) continue;
    if (tx.date < from) opening = addMinor(opening, tx.amountMinor);
    else
      add(
        tx.date,
        tx.amountMinor,
        "actual",
        tx.transferId ? "internal-transfer" : tx.categoryId,
      );
  }
  const warnings: string[] = [];
  if (
    [...transferGroups.values()].some((group) =>
      group.some((tx) => !excludedTransfers.has(tx.id)),
    )
  )
    warnings.push(
      "Unpaired or cross-date transfers remain in cash flows for the selected accounts.",
    );
  const seenObligations = new Set<string>();
  let overdueCount = 0;
  for (const obligation of input.obligations) {
    if (seenObligations.has(obligation.id))
      throw new TypeError(`Duplicate obligation ID ${obligation.id}`);
    seenObligations.add(obligation.id);
    if (input.entityIds && !input.entityIds.includes(obligation.entityId))
      continue;
    if (obligation.accountId) {
      const account = accounts.get(obligation.accountId);
      if (!account) continue;
      if (account.entityId !== obligation.entityId)
        throw new TypeError("Obligation entity does not match account");
    } else {
      if (input.accountIds) continue;
      if (!selectedEntities.has(obligation.entityId)) continue;
    }
    let value = remainingMinor(obligation);
    if (!value) continue;
    const dueDate = scenario
      ? addDays(
          obligation.dueDate,
          value > 0 ? scenario.inflowDelayDays : scenario.outflowDelayDays,
        )
      : obligation.dueDate;
    if (scenario)
      value = applyBasisPoints(
        value,
        value > 0 ? scenario.inflowBasisPoints : scenario.outflowBasisPoints,
      );
    // Unpaid overdue obligations remain outstanding; carry into the first forecast day.
    if (dueDate < from) overdueCount++;
    add(
      dueDate < from ? from : dueDate,
      value,
      "expected",
      obligation.categoryId,
    );
  }
  if (overdueCount)
    warnings.push(
      `${overdueCount} overdue obligation(s) carried into ${from}; payment timing remains an assumption.`,
    );
  if (
    input.accountIds &&
    input.obligations.some(
      (o) =>
        !o.accountId &&
        (!input.entityIds || input.entityIds.includes(o.entityId)) &&
        remainingMinor(o) !== 0,
    )
  )
    warnings.push(
      "Unassigned obligations excluded from account-filtered forecast.",
    );
  const periods: ForecastPeriod[] = [];
  let balance = opening;
  let minimum = opening;
  let minimumDate = from;
  let totalIn = 0;
  let totalOut = 0;
  const granularity = input.granularity ?? "day";
  if (!["day", "week", "month"].includes(granularity))
    throw new TypeError("Invalid granularity");
  for (const date of dates) {
    const flows = dayFlows.get(date);
    let actualIn = 0,
      actualOut = 0,
      expectedIn = 0,
      expectedOut = 0;
    for (const amount of flows?.actual ?? []) {
      if (amount >= 0) actualIn = addMinor(actualIn, amount);
      else actualOut = addMinor(actualOut, -amount);
    }
    for (const amount of flows?.expected ?? []) {
      if (amount >= 0) expectedIn = addMinor(expectedIn, amount);
      else expectedOut = addMinor(expectedOut, -amount);
    }
    const inflow = addMinor(actualIn, expectedIn),
      outflow = addMinor(actualOut, expectedOut);
    const net = addMinor(inflow, -outflow);
    const before = balance;
    balance = addMinor(balance, net);
    if (balance < minimum) {
      minimum = balance;
      minimumDate = date;
    }
    totalIn = addMinor(totalIn, inflow);
    totalOut = addMinor(totalOut, outflow);
    const key = periodKey(date, granularity);
    const previous = periods.at(-1);
    if (previous && periodKey(previous.date, granularity) === key) {
      previous.endDate = date;
      previous.actualInflowMinor = addMinor(
        previous.actualInflowMinor,
        actualIn,
      );
      previous.actualOutflowMinor = addMinor(
        previous.actualOutflowMinor,
        actualOut,
      );
      previous.expectedInflowMinor = addMinor(
        previous.expectedInflowMinor,
        expectedIn,
      );
      previous.expectedOutflowMinor = addMinor(
        previous.expectedOutflowMinor,
        expectedOut,
      );
      previous.inflowMinor = addMinor(previous.inflowMinor, inflow);
      previous.outflowMinor = addMinor(previous.outflowMinor, outflow);
      previous.netMinor = addMinor(previous.netMinor, net);
      previous.closingBalanceMinor = balance;
    } else
      periods.push({
        date,
        endDate: date,
        openingBalanceMinor: before,
        actualInflowMinor: actualIn,
        actualOutflowMinor: actualOut,
        expectedInflowMinor: expectedIn,
        expectedOutflowMinor: expectedOut,
        inflowMinor: inflow,
        outflowMinor: outflow,
        netMinor: net,
        closingBalanceMinor: balance,
      });
  }
  if (
    input.minimumBalanceMinor !== undefined &&
    minimum < assertMinor(input.minimumBalanceMinor)
  )
    warnings.push(
      `Liquidity falls below the configured buffer on ${minimumDate}.`,
    );
  return {
    currency,
    openingBalanceMinor: opening,
    closingBalanceMinor: balance,
    totalInflowMinor: totalIn,
    totalOutflowMinor: totalOut,
    minimumBalanceMinor: minimum,
    minimumBalanceDate: minimumDate,
    periods,
    categories: [...categories.values()].sort((a, b) =>
      a.categoryId.localeCompare(b.categoryId),
    ),
    warnings,
  };
}
