import { addMinor, assertMinor } from "./money";
export interface BudgetLine {
  categoryId: string;
  budgetMinor: number;
  actualMinor: number;
}
export interface VarianceLine extends BudgetLine {
  varianceMinor: number;
  favorable: boolean;
}
/** Signed values: positive inflows and negative outflows. Positive variance is favorable. */
export function calculateVariance(lines: readonly BudgetLine[]): {
  lines: VarianceLine[];
  budgetMinor: number;
  actualMinor: number;
  varianceMinor: number;
} {
  const ids = new Set<string>();
  let budget = 0,
    actual = 0;
  const result = lines.map((line) => {
    if (ids.has(line.categoryId))
      throw new TypeError("Duplicate budget category");
    ids.add(line.categoryId);
    assertMinor(line.budgetMinor);
    assertMinor(line.actualMinor);
    budget = addMinor(budget, line.budgetMinor);
    actual = addMinor(actual, line.actualMinor);
    const variance = addMinor(line.actualMinor, -line.budgetMinor);
    return { ...line, varianceMinor: variance, favorable: variance >= 0 };
  });
  return {
    lines: result,
    budgetMinor: budget,
    actualMinor: actual,
    varianceMinor: addMinor(actual, -budget),
  };
}
