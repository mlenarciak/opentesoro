import type { ISODate } from "./types";
const DAY = 86_400_000;
export function assertDate(value: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new TypeError(`Invalid ISO date: ${value}`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new TypeError(`Invalid ISO date: ${value}`);
  return value;
}
export function addDays(value: ISODate, days: number): ISODate {
  assertDate(value);
  if (!Number.isSafeInteger(days))
    throw new TypeError("Days must be a safe integer");
  const time = Date.parse(`${value}T00:00:00Z`) + days * DAY;
  if (!Number.isFinite(time))
    throw new RangeError("Date exceeds supported range");
  const result = new Date(time).toISOString().slice(0, 10);
  return assertDate(result);
}
export function daysBetween(from: ISODate, to: ISODate): number {
  return (Date.parse(assertDate(to)) - Date.parse(assertDate(from))) / DAY;
}
export function startOfWeek(value: ISODate): ISODate {
  const weekday = new Date(`${assertDate(value)}T00:00:00Z`).getUTCDay();
  return addDays(value, -(weekday === 0 ? 6 : weekday - 1));
}
export function periodKey(
  value: ISODate,
  granularity: "day" | "week" | "month",
): ISODate {
  assertDate(value);
  return granularity === "week"
    ? startOfWeek(value)
    : granularity === "month"
      ? `${value.slice(0, 7)}-01`
      : value;
}
export function dateRange(
  from: ISODate,
  to: ISODate,
  maxDays = 3660,
): ISODate[] {
  const distance = daysBetween(from, to);
  if (distance < 0 || distance > maxDays)
    throw new RangeError(`Date range must span 0–${maxDays} days`);
  return Array.from({ length: distance + 1 }, (_, i) => addDays(from, i));
}
