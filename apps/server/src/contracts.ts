import { z } from "zod";
import { schemas, date } from "./validation";
const money = z.number().int().safe();
export const forecastContract = z.object({
  currency: z.string(),
  openingBalanceMinor: money,
  closingBalanceMinor: money,
  totalInflowMinor: money,
  totalOutflowMinor: money,
  minimumBalanceMinor: money,
  minimumBalanceDate: date,
  periods: z.array(
    z.object({
      date,
      endDate: date,
      openingBalanceMinor: money,
      actualInflowMinor: money,
      actualOutflowMinor: money,
      expectedInflowMinor: money,
      expectedOutflowMinor: money,
      inflowMinor: money,
      outflowMinor: money,
      netMinor: money,
      closingBalanceMinor: money,
    }),
  ),
  categories: z.array(
    z.object({
      categoryId: z.string(),
      inflowMinor: money,
      outflowMinor: money,
      netMinor: money,
    }),
  ),
  warnings: z.array(z.string()),
});
export const agingContract = z.object({
  asOf: date,
  direction: z.enum(["receivable", "payable"]),
  totalMinor: money,
  overdueMinor: money,
  buckets: z.array(
    z.object({
      key: z.enum(["current", "1-30", "31-60", "61-90", "90+"]),
      count: z.number().int(),
      amountMinor: money,
      obligationIds: z.array(z.string()),
    }),
  ),
});
export const dashboardContract = z.object({
  asOfDate: date,
  currency: z.string(),
  balanceMinor: money,
  accounts: z.array(z.object({ id: z.string(), currentBalanceMinor: money })),
  receivables: agingContract,
  payables: agingContract,
  uncategorizedCount: z.number().int(),
  accountCount: z.number().int(),
});
export const bootstrapContract = z.object({
  version: z.string(),
  asOfDate: date,
  demo: z.boolean(),
  revision: z.number().int(),
  entities: z.array(schemas.entities),
  accounts: z.array(schemas.accounts),
  categories: z.array(schemas.categories),
  transactions: z.array(schemas.transactions),
  transactionsTotal: z.number().int(),
  obligations: z.array(schemas.obligations),
  scenarios: z.array(schemas.scenarios),
  bookings: z.array(schemas.bookings),
  rules: z.array(schemas.rules),
  settlements: z.array(schemas.settlements),
});
export const previewContract = z.object({
  rows: z.array(
    z.object({
      row: z.number().int(),
      date,
      description: z.string(),
      counterparty: z.string(),
      amountMinor: money,
      externalId: z.string(),
    }),
  ),
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
  totalRows: z.number().int(),
  delimiter: z.string(),
});
export const candidatesContract = z.object({
  items: z.array(
    z.object({
      obligationId: z.string(),
      score: z.number(),
      amountMinor: money,
      reasons: z.array(z.string()),
    }),
  ),
});
