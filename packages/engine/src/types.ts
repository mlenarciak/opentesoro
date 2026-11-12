/** Money is signed safe-integer minor units. Dates are ISO YYYY-MM-DD. */
export type ISODate = string;
export interface Entity {
  id: string;
  name: string;
  currency: string;
}
/** balanceMinor is the account's CLOSED balance at the end of asOfDate. */
export interface Account {
  id: string;
  entityId: string;
  name: string;
  bank: string;
  currency: string;
  balanceMinor: number;
  asOfDate: ISODate;
  enabled: boolean;
}
export interface Category {
  id: string;
  name: string;
  direction: "inflow" | "outflow" | "both";
  parentId?: string;
}
export interface Transaction {
  id: string;
  entityId: string;
  accountId: string;
  date: ISODate;
  amountMinor: number;
  description: string;
  counterparty: string;
  categoryId?: string;
  externalId?: string;
  transferId?: string;
}
/** settledMinor is absolute (nonnegative), even for payable obligations. */
export interface Obligation {
  id: string;
  entityId: string;
  accountId?: string;
  dueDate: ISODate;
  amountMinor: number;
  settledMinor: number;
  description: string;
  counterparty: string;
  categoryId?: string;
  bookingId?: string;
  status: "open" | "partial" | "settled" | "cancelled";
}
export interface Scenario {
  id: string;
  name: string;
  inflowBasisPoints: number;
  outflowBasisPoints: number;
  inflowDelayDays: number;
  outflowDelayDays: number;
}
export interface ForecastInput {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  obligations: readonly Obligation[];
  from: ISODate;
  to: ISODate;
  granularity?: "day" | "week" | "month";
  scenario?: Scenario;
  entityIds?: readonly string[];
  accountIds?: readonly string[];
  minimumBalanceMinor?: number;
}
export interface ForecastPeriod {
  date: ISODate;
  endDate: ISODate;
  openingBalanceMinor: number;
  actualInflowMinor: number;
  actualOutflowMinor: number;
  expectedInflowMinor: number;
  expectedOutflowMinor: number;
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  closingBalanceMinor: number;
}
export interface ForecastCategory {
  categoryId: string;
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
}
export interface Forecast {
  currency: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  totalInflowMinor: number;
  totalOutflowMinor: number;
  minimumBalanceMinor: number;
  minimumBalanceDate: ISODate;
  periods: ForecastPeriod[];
  categories: ForecastCategory[];
  warnings: string[];
}
