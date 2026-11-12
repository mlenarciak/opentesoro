import { assertMinor } from "./money";
import type { Transaction } from "./types";
export interface CategorizationRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  categoryId: string;
  conditions: {
    descriptionIncludes?: string;
    counterpartyIncludes?: string;
    accountId?: string;
    entityId?: string;
    direction?: "inflow" | "outflow";
    minAbsoluteMinor?: number;
    maxAbsoluteMinor?: number;
  };
}
export interface CategorizationResult {
  categoryId: string;
  ruleId: string;
  reason: string;
}
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT");
/** AND within each rule, first matching rule by ascending priority and stable ID. */
export function categorizeTransaction(
  transaction: Transaction,
  rules: readonly CategorizationRule[],
): CategorizationResult | null {
  assertMinor(transaction.amountMinor);
  for (const rule of [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    if (!Number.isSafeInteger(rule.priority))
      throw new TypeError("Rule priority must be a safe integer");
    const c = rule.conditions;
    if (c.minAbsoluteMinor !== undefined) assertMinor(c.minAbsoluteMinor);
    if (c.maxAbsoluteMinor !== undefined) assertMinor(c.maxAbsoluteMinor);
    if (c.accountId && c.accountId !== transaction.accountId) continue;
    if (c.entityId && c.entityId !== transaction.entityId) continue;
    if (
      c.direction &&
      (c.direction === "inflow"
        ? transaction.amountMinor <= 0
        : transaction.amountMinor >= 0)
    )
      continue;
    if (
      c.descriptionIncludes &&
      !normalize(transaction.description).includes(
        normalize(c.descriptionIncludes),
      )
    )
      continue;
    if (
      c.counterpartyIncludes &&
      !normalize(transaction.counterparty).includes(
        normalize(c.counterpartyIncludes),
      )
    )
      continue;
    if (
      c.minAbsoluteMinor !== undefined &&
      Math.abs(transaction.amountMinor) < c.minAbsoluteMinor
    )
      continue;
    if (
      c.maxAbsoluteMinor !== undefined &&
      Math.abs(transaction.amountMinor) > c.maxAbsoluteMinor
    )
      continue;
    return {
      categoryId: rule.categoryId,
      ruleId: rule.id,
      reason: `Matched rule: ${rule.name}`,
    };
  }
  return null;
}
