import { assertDate, daysBetween } from "./dates";
import { addMinor } from "./money";
import { remainingMinor } from "./obligations";
import type { Obligation, ISODate } from "./types";
export interface AgingBucket {
  key: "current" | "1-30" | "31-60" | "61-90" | "90+";
  count: number;
  amountMinor: number;
  obligationIds: string[];
}
export interface AgingReport {
  asOf: ISODate;
  direction: "receivable" | "payable";
  totalMinor: number;
  overdueMinor: number;
  buckets: AgingBucket[];
}
export function buildAgingReport(
  obligations: readonly Obligation[],
  asOf: ISODate,
  direction: "receivable" | "payable",
  entityIds?: readonly string[],
): AgingReport {
  assertDate(asOf);
  const buckets: AgingBucket[] = [
    "current",
    "1-30",
    "31-60",
    "61-90",
    "90+",
  ].map((key) => ({
    key: key as AgingBucket["key"],
    count: 0,
    amountMinor: 0,
    obligationIds: [],
  }));
  let total = 0,
    overdue = 0;
  for (const obligation of obligations) {
    if (entityIds && !entityIds.includes(obligation.entityId)) continue;
    const remaining = remainingMinor(obligation);
    if (
      !remaining ||
      (direction === "receivable" ? remaining < 0 : remaining > 0)
    )
      continue;
    const days = daysBetween(obligation.dueDate, asOf),
      index =
        days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    const bucket = buckets[index]!;
    const amount = Math.abs(remaining);
    bucket.count++;
    bucket.amountMinor = addMinor(bucket.amountMinor, amount);
    bucket.obligationIds.push(obligation.id);
    total = addMinor(total, amount);
    if (days > 0) overdue = addMinor(overdue, amount);
  }
  return { asOf, direction, totalMinor: total, overdueMinor: overdue, buckets };
}
