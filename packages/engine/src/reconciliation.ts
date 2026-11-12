import { assertDate, daysBetween } from "./dates";
import { addMinor, assertMinor } from "./money";
import { remainingMinor } from "./obligations";
import type { Obligation, Transaction } from "./types";
export interface Settlement {
  id: string;
  transactionId: string;
  obligationId: string;
  amountMinor: number;
}
export interface ReconciliationCandidate {
  obligationId: string;
  score: number;
  amountMinor: number;
  reasons: string[];
}
const normalized = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Suggestions only: never automatically settle a fuzzy candidate. */
export function suggestReconciliation(
  transaction: Transaction,
  obligations: readonly Obligation[],
  settlements: readonly Settlement[] = [],
): ReconciliationCandidate[] {
  assertMinor(transaction.amountMinor);
  assertDate(transaction.date);
  if (transaction.transferId) return [];
  const used = settledTransactionMinor(transaction.id, settlements);
  const available = addMinor(Math.abs(transaction.amountMinor), -used);
  if (available < 0) throw new RangeError("Transaction is overallocated");
  if (!available) return [];
  return obligations
    .flatMap((obligation) => {
      if (
        obligation.entityId !== transaction.entityId ||
        (obligation.accountId && obligation.accountId !== transaction.accountId)
      )
        return [];
      const outstanding = remainingMinor(obligation);
      if (
        !outstanding ||
        Math.sign(outstanding) !== Math.sign(transaction.amountMinor)
      )
        return [];
      const reasons: string[] = [];
      let score = 0;
      if (Math.abs(outstanding) === available) {
        score += 50;
        reasons.push("Exact remaining amount");
      } else if (available <= Math.abs(outstanding)) {
        score += 20;
        reasons.push("Possible partial payment");
      } else {
        score += 5;
        reasons.push("Payment exceeds remaining amount; split required");
      }
      const name = normalized(obligation.counterparty);
      const payer = normalized(transaction.counterparty);
      if (name && payer && name === payer) {
        score += 30;
        reasons.push("Matching counterparty");
      }
      if (
        obligation.bookingId &&
        normalized(obligation.bookingId) &&
        normalized(transaction.description).includes(
          normalized(obligation.bookingId),
        )
      ) {
        score += 30;
        reasons.push("Booking reference found");
      }
      const distance = Math.abs(
        daysBetween(obligation.dueDate, transaction.date),
      );
      if (distance <= 3) {
        score += 20;
        reasons.push("Payment within three days of due date");
      } else if (distance <= 14) {
        score += 10;
        reasons.push("Payment within two weeks");
      }
      return [
        {
          obligationId: obligation.id,
          score: Math.min(score, 100),
          amountMinor: Math.min(available, Math.abs(outstanding)),
          reasons,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.obligationId.localeCompare(b.obligationId),
    );
}
export function settledTransactionMinor(
  transactionId: string,
  settlements: readonly Settlement[],
): number {
  let sum = 0;
  const ids = new Set<string>();
  for (const s of settlements) {
    if (ids.has(s.id)) throw new TypeError("Duplicate settlement ID");
    ids.add(s.id);
    assertMinor(s.amountMinor);
    if (s.amountMinor <= 0)
      throw new RangeError("Settlement amount must be positive");
    if (s.transactionId === transactionId) sum = addMinor(sum, s.amountMinor);
  }
  return sum;
}
/** Call in one database transaction with a unique settlement ID for atomic persistence. */
export function reconcilePayment(input: {
  transaction: Transaction;
  obligation: Obligation;
  amountMinor: number;
  settlementId: string;
  settlements?: readonly Settlement[];
}): { obligation: Obligation; settlement: Settlement } {
  const { transaction, obligation, amountMinor, settlementId } = input;
  const settlements = input.settlements ?? [];
  if (!settlementId.trim() || settlements.some((s) => s.id === settlementId))
    throw new TypeError("Settlement ID must be nonempty and unique");
  assertMinor(amountMinor);
  assertMinor(transaction.amountMinor);
  assertDate(transaction.date);
  if (transaction.transferId)
    throw new TypeError("Internal transfers cannot settle trading obligations");
  if (amountMinor <= 0)
    throw new RangeError("Settlement amount must be positive");
  if (
    transaction.entityId !== obligation.entityId ||
    (obligation.accountId && obligation.accountId !== transaction.accountId)
  )
    throw new TypeError("Settlement account/entity mismatch");
  const remaining = remainingMinor(obligation);
  if (!remaining || Math.sign(remaining) !== Math.sign(transaction.amountMinor))
    throw new RangeError(
      "Transaction and outstanding obligation must have the same direction",
    );
  if (amountMinor > Math.abs(remaining))
    throw new RangeError("Settlement exceeds outstanding obligation");
  if (
    addMinor(
      settledTransactionMinor(transaction.id, settlements),
      amountMinor,
    ) > Math.abs(transaction.amountMinor)
  )
    throw new RangeError("Settlement exceeds unallocated transaction amount");
  const settled = addMinor(obligation.settledMinor, amountMinor);
  return {
    obligation: {
      ...obligation,
      settledMinor: settled,
      status:
        settled === Math.abs(obligation.amountMinor) ? "settled" : "partial",
    },
    settlement: {
      id: settlementId,
      transactionId: transaction.id,
      obligationId: obligation.id,
      amountMinor,
    },
  };
}
