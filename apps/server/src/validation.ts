import { z } from "zod";
import type { Collection } from "./store";
const id = z.string().min(1).max(120);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid calendar date");
const money = z
  .number()
  .int()
  .refine(Number.isSafeInteger, "Amount exceeds safe minor-unit range");
const text = z.string().trim().min(1).max(1000);
const currency = z.literal("EUR");
const base = { id };
export const entitySchema = z.object({
  ...base,
  name: text,
  currency: currency.default("EUR"),
});
export const accountSchema = z.object({
  ...base,
  entityId: id,
  name: text,
  bank: text,
  currency: currency.default("EUR"),
  balanceMinor: money,
  asOfDate: date,
  enabled: z.boolean().default(true),
});
export const categorySchema = z.object({
  ...base,
  name: text,
  direction: z.enum(["inflow", "outflow", "both"]),
  parentId: id.optional(),
});
export const transactionSchema = z.object({
  ...base,
  entityId: id,
  accountId: id,
  date,
  amountMinor: money,
  description: text,
  counterparty: z.string().max(300).default(""),
  categoryId: id.optional(),
  externalId: z.string().min(1).max(240).optional(),
  transferId: id.optional(),
});
export const obligationSchema = z
  .object({
    ...base,
    entityId: id,
    accountId: id.optional(),
    dueDate: date,
    amountMinor: money.refine((x) => x !== 0, "Obligation cannot be zero"),
    settledMinor: money.refine((x) => x >= 0).default(0),
    description: text,
    counterparty: z.string().max(300).default(""),
    categoryId: id.optional(),
    bookingId: id.optional(),
    status: z.enum(["open", "partial", "settled", "cancelled"]).default("open"),
  })
  .refine(
    (x) => x.settledMinor <= Math.abs(x.amountMinor),
    "Settlement exceeds obligation",
  )
  .refine(
    (x) =>
      x.status === "cancelled" ||
      (x.settledMinor === 0
        ? x.status === "open"
        : x.settledMinor === Math.abs(x.amountMinor)
          ? x.status === "settled"
          : x.status === "partial"),
    "Status must agree with settled amount",
  );
export const scenarioSchema = z.object({
  ...base,
  name: text,
  inflowBasisPoints: z.number().int().min(0).max(100000).default(10000),
  outflowBasisPoints: z.number().int().min(0).max(100000).default(10000),
  inflowDelayDays: z.number().int().min(-365).max(365).default(0),
  outflowDelayDays: z.number().int().min(-365).max(365).default(0),
});
export const bookingSchema = z
  .object({
    ...base,
    entityId: id,
    accountId: id,
    reference: text,
    customer: text,
    destination: text,
    departureDate: date,
    returnDate: date,
    totalMinor: money.refine((x) => x > 0),
    depositBasisPoints: z.number().int().min(0).max(10000).default(3000),
    bookingDate: date,
    balanceDaysBefore: z.number().int().min(0).max(365).default(30),
    supplierName: z.string().max(300).default(""),
    supplierCostMinor: money.refine((x) => x >= 0).default(0),
    supplierDepositBasisPoints: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(2000),
    supplierBalanceDaysBefore: z.number().int().min(0).max(365).default(14),
    status: z.enum(["confirmed", "cancelled"]).default("confirmed"),
  })
  .refine(
    (x) => x.returnDate >= x.departureDate,
    "Return must follow departure",
  )
  .refine(
    (x) => x.bookingDate <= x.departureDate,
    "Booking must precede departure",
  );
export const ruleSchema = z.object({
  ...base,
  name: text,
  categoryId: id,
  priority: z.number().int().default(0),
  contains: text,
  direction: z.enum(["inflow", "outflow", "both"]).default("both"),
  enabled: z.boolean().default(true),
});
export const settlementSchema = z.object({
  ...base,
  transactionId: id,
  obligationId: id,
  amountMinor: money.refine((x) => x > 0),
});
export const schemas = {
  entities: entitySchema,
  accounts: accountSchema,
  categories: categorySchema,
  transactions: transactionSchema,
  obligations: obligationSchema,
  scenarios: scenarioSchema,
  bookings: bookingSchema,
  rules: ruleSchema,
  settlements: settlementSchema,
} satisfies Record<Collection, z.ZodType>;
