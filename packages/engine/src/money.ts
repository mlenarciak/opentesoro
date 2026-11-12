/** Safe integer money; BigInt intermediates preserve exactness across overflow and cancellation. */
export function assertMinor(value: number, name = "amountMinor"): number {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`${name} must be a safe integer`);
  return value;
}
export function safeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new RangeError("Money exceeds safe-integer range");
  return result;
}
export function addMinor(...values: number[]): number {
  let sum = 0;
  for (let index = 0; index < values.length; index++) {
    const value = assertMinor(values[index]!);
    const next = sum + value;
    if (Number.isSafeInteger(next)) {
      sum = next;
      continue;
    }
    let exact = BigInt(sum) + BigInt(value);
    for (let rest = index + 1; rest < values.length; rest++)
      exact += BigInt(assertMinor(values[rest]!));
    return safeNumber(exact);
  }
  return sum;
}
/** Parse canonical decimal text, never a floating-point number. Defaults to EUR's 2 digits. */
export function parseMoney(value: string, decimals = 2): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)
    throw new RangeError("Invalid decimal precision");
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[3]?.length ?? 0) > decimals)
    throw new TypeError("Use a canonical decimal amount, e.g. 1234.56");
  const unsigned =
    BigInt(match[2]!) * 10n ** BigInt(decimals) +
    BigInt((match[3] ?? "").padEnd(decimals, "0") || "0");
  return safeNumber(match[1] === "-" ? -unsigned : unsigned);
}
/** Italian CSV number with comma decimals, optional dot thousands, and optional EUR suffix. */
export function parseItalianMoney(value: string): number {
  const normalized = value
    .trim()
    .replace(/\s*(?:€|EUR)$/i, "")
    .trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized))
    throw new TypeError("Invalid Italian amount");
  return parseMoney(normalized.replaceAll(".", "").replace(",", "."));
}
export function minorToDecimal(value: number, decimals = 2): string {
  assertMinor(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)
    throw new RangeError("Invalid decimal precision");
  const amount = BigInt(value);
  const abs = amount < 0n ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);
  return `${amount < 0n ? "-" : ""}${abs / divisor}${decimals ? "." + (abs % divisor).toString().padStart(decimals, "0") : ""}`;
}
/** Display only; all financial calculations retain integer minor units. */
export function formatMoney(
  value: number,
  currency = "EUR",
  locale = "it-IT",
): string {
  assertMinor(value);
  assertCurrency(currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const decimals = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  const divisor = 10n ** BigInt(decimals),
    whole = absolute / divisor;
  const signedWhole = amount < 0n ? (whole === 0n ? -0 : -whole) : whole;
  const fraction = (absolute % divisor).toString().padStart(decimals, "0");
  return formatter
    .formatToParts(signedWhole)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
/** Round half away from zero, using exact rational arithmetic. */
export function multiplyRatio(
  value: number,
  numerator: number,
  denominator: number,
): number {
  assertMinor(value);
  assertMinor(numerator, "numerator");
  assertMinor(denominator, "denominator");
  if (denominator <= 0) throw new RangeError("Denominator must be positive");
  const product = BigInt(value) * BigInt(numerator);
  const abs = product < 0n ? -product : product;
  const divisor = BigInt(denominator);
  const rounded = (abs + divisor / 2n) / divisor;
  return safeNumber(product < 0n ? -rounded : rounded);
}
export function applyBasisPoints(value: number, basisPoints: number): number {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0)
    throw new RangeError("Basis points must be nonnegative safe integers");
  return multiplyRatio(value, basisPoints, 10_000);
}
export function assertCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency))
    throw new TypeError("Currency must be a three-letter ISO code");
}
