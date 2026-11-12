import { addDays, assertDate } from "./dates";
import { addMinor, applyBasisPoints, assertMinor } from "./money";
import type { Obligation, ISODate } from "./types";
export interface SupplierPayment {
  id: string;
  supplier: string;
  amountMinor: number;
  dueDate?: ISODate;
  daysBeforeDeparture?: number;
  categoryId?: string;
  accountId?: string;
}
export interface TravelBooking {
  id: string;
  entityId: string;
  reference: string;
  customer: string;
  destination: string;
  departureDate: ISODate;
  returnDate: ISODate;
  bookedDate: ISODate;
  totalMinor: number;
  depositBasisPoints: number;
  depositDueDate?: ISODate;
  balanceDaysBeforeDeparture: number;
  accountId?: string;
  categoryId?: string;
  supplierPayments?: readonly SupplierPayment[];
}
/** Receipts are gross contractual cash, not revenue recognition or a VAT calculation. */
export function buildBookingSchedule(booking: TravelBooking): Obligation[] {
  if (!booking.id.trim() || !booking.reference.trim())
    throw new TypeError("Booking identity and reference are required");
  assertDate(booking.departureDate);
  assertDate(booking.returnDate);
  assertDate(booking.bookedDate);
  assertMinor(booking.totalMinor);
  if (
    booking.returnDate < booking.departureDate ||
    booking.bookedDate > booking.departureDate
  )
    throw new RangeError("Invalid booking dates");
  if (booking.totalMinor <= 0)
    throw new RangeError("Booking total must be positive");
  if (
    !Number.isSafeInteger(booking.depositBasisPoints) ||
    booking.depositBasisPoints < 0 ||
    booking.depositBasisPoints > 10000
  )
    throw new RangeError("Deposit basis points must be between 0 and 10000");
  if (
    !Number.isSafeInteger(booking.balanceDaysBeforeDeparture) ||
    booking.balanceDaysBeforeDeparture < 0 ||
    booking.balanceDaysBeforeDeparture > 3660
  )
    throw new RangeError("Invalid balance payment offset");
  const deposit = applyBasisPoints(
    booking.totalMinor,
    booking.depositBasisPoints,
  );
  const balance = addMinor(booking.totalMinor, -deposit);
  const depositDate = assertDate(booking.depositDueDate ?? booking.bookedDate);
  // Late bookings have their outstanding balance due immediately rather than before booking.
  const contractualBalanceDate = addDays(
    booking.departureDate,
    -booking.balanceDaysBeforeDeparture,
  );
  const balanceDate =
    contractualBalanceDate < booking.bookedDate
      ? booking.bookedDate
      : contractualBalanceDate;
  const base = {
    entityId: booking.entityId,
    accountId: booking.accountId,
    counterparty: booking.customer,
    categoryId: booking.categoryId ?? "customer-receipts",
    bookingId: booking.id,
    settledMinor: 0,
    status: "open" as const,
  };
  const result: Obligation[] = [];
  if (deposit)
    result.push({
      ...base,
      id: `${booking.id}:deposit`,
      dueDate: depositDate,
      amountMinor: deposit,
      description: `Acconto ${booking.reference} · ${booking.destination}`,
    });
  if (balance)
    result.push({
      ...base,
      id: `${booking.id}:balance`,
      dueDate: balanceDate,
      amountMinor: balance,
      description: `Saldo ${booking.reference} · ${booking.destination}`,
    });
  const suppliers = new Set<string>();
  for (const payment of booking.supplierPayments ?? []) {
    if (suppliers.has(payment.id))
      throw new TypeError("Duplicate supplier installment ID");
    suppliers.add(payment.id);
    assertMinor(payment.amountMinor);
    if (payment.amountMinor <= 0)
      throw new RangeError("Supplier installment must be positive");
    if (
      payment.dueDate !== undefined &&
      payment.daysBeforeDeparture !== undefined
    )
      throw new TypeError(
        "Choose supplier due date or departure offset, not both",
      );
    const offset = payment.daysBeforeDeparture ?? 0;
    if (!Number.isSafeInteger(offset) || Math.abs(offset) > 3660)
      throw new RangeError("Invalid supplier payment offset");
    const dueDate = payment.dueDate
      ? assertDate(payment.dueDate)
      : addDays(booking.departureDate, -offset);
    result.push({
      ...base,
      id: `${booking.id}:supplier:${payment.id}`,
      counterparty: payment.supplier,
      accountId: payment.accountId ?? booking.accountId,
      categoryId: payment.categoryId ?? "supplier-payments",
      dueDate,
      amountMinor: -payment.amountMinor,
      description: `Fornitore ${booking.reference} · ${payment.supplier}`,
    });
  }
  return result;
}
export function bookingCashExposure(
  bookingId: string,
  obligations: readonly Obligation[],
): { receiptsMinor: number; paymentsMinor: number; netMinor: number } {
  let receipts = 0,
    payments = 0;
  for (const o of obligations) {
    if (o.bookingId !== bookingId || o.status === "cancelled") continue;
    assertMinor(o.amountMinor);
    if (o.amountMinor > 0) receipts = addMinor(receipts, o.amountMinor);
    else payments = addMinor(payments, -o.amountMinor);
  }
  return {
    receiptsMinor: receipts,
    paymentsMinor: payments,
    netMinor: addMinor(receipts, -payments),
  };
}
