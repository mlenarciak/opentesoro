# Italian tour-operator treasury workflows

This is a proposed operational model for an Italian business using EUR as its reporting currency. Examples are synthetic. Dates, payment percentages, cancellation terms, taxes and reserves are configurable business inputs, not legal or tax advice. No assumption about a specific customer's actual booking conditions is embedded here.

## The cash cycle to model

A tour operator can take customer deposits months before departure, pay supplier advances before collecting customer balances, and pay final supplier balances after the trip. Group accounts, card processors, agencies and direct customers may settle on different days. The central question is whether cash is available on the dates commitments fall due, not whether a departure has positive accounting margin.

Every booking should have a stable external reference, entity, departure/return dates, currency, gross customer amount, and explicit cash installments. Each supplier commitment has its own commercial counterparty, settlement account if known, due dates, currency, booking/departure reference and refundable/non-refundable business terms. Avoid deriving every supplier payment as a fixed percentage of the customer price; hotel allotments and charter commitments can exist independently of sold bookings.

## Synthetic worked example

Booking `OT-DEMO-2042`: 20 travelers, EUR 30,000 total, departure 2027-06-15.

| Event                  | Date       | Cash amount | Nature                 |
| ---------------------- | ---------- | ----------: | ---------------------- |
| Customer deposit, 30%  | 2027-02-10 |     +€9,000 | Receivable installment |
| Hotel advance          | 2027-03-01 |     −€8,000 | Supplier payable       |
| Carrier advance        | 2027-03-10 |     −€6,000 | Supplier payable       |
| Customer final balance | 2027-05-16 |    +€21,000 | Receivable installment |
| Hotel final balance    | 2027-06-01 |     −€7,000 | Supplier payable       |
| Local-services balance | 2027-06-25 |     −€4,000 | Supplier payable       |

The booking's net cash contribution is €5,000, yet its standalone cumulative cash reaches **−€5,000 on 2027-03-10**. An operating cash buffer or other cash source must cover that timing gap. This is simple arithmetic on the synthetic schedule, not a financing recommendation. Global account balances and other commitments determine the actual company liquidity position.

Partial receipt example: if €6,000 of the deposit is paid, the actual receipt is +€6,000 and only +€3,000 remains expected. A bank transaction reconciled to that deposit must not create an additional +€9,000 forecast. If an agency remits multiple booking balances together, preserve the allocation relationship and any unallocated residual instead of choosing one booking arbitrarily.

## First release workflows

1. **Morning cash position:** review account balances with their as-of date, stale-source warnings, and available account filters. Show EUR totals only when the included currencies are valid for that total.
2. **13-week cash review:** inspect daily or weekly customer installments, supplier deadlines, payroll and configured recurring business obligations. Drill into the worst balance date.
3. **Collection queue:** group overdue deposits/final balances by commercial counterparty and booking, retaining promised dates separately from contractual due dates.
4. **Supplier preparation:** identify upcoming hotel/allotment/carrier commitments and their deadlines. Marking an obligation ready does not itself initiate a payment.
5. **Scenario review:** test collection delays, lower expected new sales, higher supplier costs, or a cancellation/refund wave without modifying booked actuals.
6. **Close and reconcile:** match cash receipts/payments to obligations; review partials, unknown remittances, overpayments, reversals and internal transfers.
7. **Import from booking/ERP systems:** preview records, validate currency/date/reference, identify duplicates/conflicts, commit atomically and retain source provenance.

## Important distinctions

**Booking vs invoice vs cash obligation.** A booking can have several invoices and many payment installments. A quote is not necessarily a firm receivable. Do not create expected cash from both the booking schedule and its corresponding invoice without an explicit precedence or supersession link.

**Due date vs expected receipt date.** Keep contractual dates for aging and collection actions. Scenario or payment-behavior adjustments affect forecast timing, not the contractual record.

**Revenue vs bank settlement.** Card processors may settle net of fees and with a lag. Do not infer gross revenue or fee expense solely from the net deposit. Track settlement batches and allocate them when authoritative detail is available.

**Transfer vs operating cash.** Moving money between company bank accounts changes account balances but not consolidated operating receipts. The balancing leg may arrive on a different bank date. Cross-entity transfers and intercompany financing need separate rules rather than being hidden as revenue.

**Cancellation vs refund vs supplier recovery.** Canceling a booking should not erase paid history. Record a new customer refund obligation, preserve any retained charge according to configured terms, and separately record expected supplier recovery when supported. A supplier credit note is not cash until applied or refunded.

**Tax estimate vs tax compliance.** First release may hold explicit accountant-provided tax cash obligations. It must not claim to compute Italian VAT, the travel-agency margin regime, e-invoicing or statutory reporting correctly. Later tax modules need jurisdiction/version metadata, authoritative rule sources and accountant-reviewed cases. Keep cash planning usable without pretending to be a tax ledger.

## Recommended dimensions and categories

Dimensions: entity, bank account, currency, commercial counterparty, booking reference, departure/cohort, destination, channel (direct/agency/OTA), product, source system, obligation status and owner. Keep tags optional and avoid collecting traveler personal data when a booking reference is enough.

Starter categories: customer deposits, customer balances, agency remittances, customer refunds, hotel advances/balances, carrier commitments, local services, insurance, payment-processing fees, payroll, rent, marketing, taxes provided by the accountant, financing and internal transfers. Categories are configurable classifications rather than statutory chart-of-account codes.

## Acceptance cases for the travel extension

- Deposit plus balance equals the agreed booking total exactly, including odd-cent rounding.
- Zero-percent and full-deposit schedules are intentional and validated; no phantom duplicate installment is generated.
- Departure minus N days works across month/year/leap boundaries.
- A revised booking schedule has stable identities or explicit supersession, so importing again does not duplicate obligations.
- Partial customer receipts and partial supplier payments reduce only the matched residual.
- A canceled booking preserves actual cash movements and explains future refunds.
- A customer invoice replacing a booking installment does not count twice.
- Entity/currency/account restrictions cannot silently hide part of a reconciliation.
- A scenario applies only to remaining expected cash, with visible amount and date changes.

The broader cash-management capability reference is [Agicap cash management](https://agicap.com/en/products/cash-management/). These tour-operator workflows are OpenTesoro's proposed design, not claims about Agicap-specific travel functionality.
