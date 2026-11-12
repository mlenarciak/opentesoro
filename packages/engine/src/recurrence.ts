import { addDays, assertDate, daysBetween } from "./dates";
import { assertMinor } from "./money";
import type { Obligation, ISODate } from "./types";
export interface RecurringObligation {
  id: string;
  entityId: string;
  accountId?: string;
  description: string;
  counterparty: string;
  categoryId?: string;
  amountMinor: number;
  startDate: ISODate;
  endDate?: ISODate;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
}
/** Month-end clamping retains the original anchor: Jan 31 → Feb 28 → Mar 31. */
function monthOccurrence(anchor: ISODate, offset: number): ISODate {
  const year = Number(anchor.slice(0, 4)),
    month = Number(anchor.slice(5, 7)) - 1,
    day = Number(anchor.slice(8, 10));
  const target = new Date(`${anchor}T00:00:00Z`);
  target.setUTCFullYear(year, month + offset + 1, 0);
  target.setUTCDate(Math.min(day, target.getUTCDate()));
  return assertDate(target.toISOString().slice(0, 10));
}
export function expandRecurringObligations(
  template: RecurringObligation,
  from: ISODate,
  to: ISODate,
): Obligation[] {
  assertDate(template.startDate);
  assertDate(from);
  assertDate(to);
  if (template.endDate) assertDate(template.endDate);
  assertMinor(template.amountMinor);
  if (daysBetween(from, to) < 0 || daysBetween(from, to) > 3660)
    throw new RangeError("Recurring horizon must be 0–3660 days");
  if (!template.id.trim() || !template.amountMinor)
    throw new TypeError("Recurring identity and nonzero amount required");
  if (template.endDate && template.endDate < template.startDate)
    throw new RangeError("Recurring end precedes start");
  const increment = { weekly: 0, monthly: 1, quarterly: 3, yearly: 12 }[
    template.frequency
  ];
  if (increment === undefined)
    throw new TypeError("Invalid recurrence frequency");
  const result: Obligation[] = [];
  const end = template.endDate && template.endDate < to ? template.endDate : to;
  // Jump near the requested range so an old template never causes unbounded iteration.
  let occurrence =
    template.frequency === "weekly"
      ? Math.max(0, Math.floor(daysBetween(template.startDate, from) / 7) - 1)
      : Math.max(
          0,
          Math.floor(
            ((Number(from.slice(0, 4)) -
              Number(template.startDate.slice(0, 4))) *
              12 +
              Number(from.slice(5, 7)) -
              Number(template.startDate.slice(5, 7))) /
              increment,
          ) - 1,
        );
  for (let i = occurrence; i < occurrence + 530; i++) {
    const dueDate =
      template.frequency === "weekly"
        ? addDays(template.startDate, i * 7)
        : monthOccurrence(template.startDate, i * increment);
    if (dueDate > end) break;
    if (dueDate < from) continue;
    result.push({
      id: `${template.id}:${dueDate}`,
      entityId: template.entityId,
      accountId: template.accountId,
      dueDate,
      amountMinor: template.amountMinor,
      settledMinor: 0,
      status: "open",
      description: template.description,
      counterparty: template.counterparty,
      categoryId: template.categoryId,
    });
  }
  return result;
}
