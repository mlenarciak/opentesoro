import { assertDate } from "./dates";
import { assertMinor } from "./money";
import type { Obligation } from "./types";
export function remainingMinor(obligation: Obligation): number {
  assertMinor(obligation.amountMinor);
  assertMinor(obligation.settledMinor, "settledMinor");
  assertDate(obligation.dueDate);
  if (!["open", "partial", "settled", "cancelled"].includes(obligation.status))
    throw new TypeError("Invalid obligation status");
  if (obligation.amountMinor === 0)
    throw new RangeError("Obligation cannot be zero");
  if (obligation.status === "open" && obligation.settledMinor !== 0)
    throw new RangeError("Open obligation cannot already have settlements");
  if (
    obligation.status === "partial" &&
    (obligation.settledMinor <= 0 ||
      obligation.settledMinor >= Math.abs(obligation.amountMinor))
  )
    throw new RangeError("Partial obligation must be partially settled");
  if (
    obligation.settledMinor < 0 ||
    obligation.settledMinor > Math.abs(obligation.amountMinor)
  )
    throw new RangeError("Invalid obligation settled amount");
  if (obligation.status === "cancelled") return 0;
  if (
    obligation.status === "settled" &&
    obligation.settledMinor !== Math.abs(obligation.amountMinor)
  )
    throw new RangeError("Settled obligation must be fully paid");
  return (
    Math.sign(obligation.amountMinor) *
    (Math.abs(obligation.amountMinor) - obligation.settledMinor)
  );
}
