import type { Store, RecordData, Collection } from "./store";
import {
  buildBookingSchedule,
  applyBasisPoints,
  addDays,
} from "@opentesoro/engine";
export const DEMO_DATE = "2026-11-12";
export function seedDemo(store: Store) {
  if (store.list("entities").length) return;
  store.atomic(() => {
    const put = (kind: Collection, rows: unknown[]) =>
      rows.forEach((row) => store.put(kind, row as RecordData, "demo-seed"));
    put("entities", [
      { id: "gb-tour", name: "Viaggi Mediterraneo S.r.l.", currency: "EUR" },
      {
        id: "gb-incoming",
        name: "Mediterraneo Incoming S.r.l.",
        currency: "EUR",
      },
    ]);
    put("accounts", [
      {
        id: "intesa",
        entityId: "gb-tour",
        name: "Conto operativo",
        bank: "Intesa Sanpaolo",
        currency: "EUR",
        balanceMinor: 18425000,
        asOfDate: "2026-10-31",
        enabled: true,
      },
      {
        id: "unicredit",
        entityId: "gb-tour",
        name: "Incassi agenzie",
        bank: "UniCredit",
        currency: "EUR",
        balanceMinor: 6830000,
        asOfDate: "2026-10-31",
        enabled: true,
      },
      {
        id: "bpm",
        entityId: "gb-incoming",
        name: "Conto incoming",
        bank: "Banco BPM",
        currency: "EUR",
        balanceMinor: 4275000,
        asOfDate: "2026-10-31",
        enabled: true,
      },
    ]);
    put("categories", [
      { id: "customer-receipts", name: "Incassi clienti", direction: "inflow" },
      { id: "agency-receipts", name: "Incassi agenzie", direction: "inflow" },
      {
        id: "supplier-payments",
        name: "Hotel e strutture",
        direction: "outflow",
      },
      { id: "transport", name: "Trasporti e voli", direction: "outflow" },
      { id: "payroll", name: "Personale", direction: "outflow" },
      { id: "marketing", name: "Marketing", direction: "outflow" },
      { id: "taxes", name: "Imposte e contributi", direction: "outflow" },
      { id: "refunds", name: "Rimborsi clienti", direction: "outflow" },
      { id: "overhead", name: "Costi operativi", direction: "outflow" },
      { id: "transfers", name: "Giroconti", direction: "both" },
    ]);
    put("scenarios", [
      {
        id: "base",
        name: "Piano base",
        inflowBasisPoints: 10000,
        outflowBasisPoints: 10000,
        inflowDelayDays: 0,
        outflowDelayDays: 0,
      },
      {
        id: "prudent",
        name: "Prudente · incassi +15 giorni",
        inflowBasisPoints: 9000,
        outflowBasisPoints: 10500,
        inflowDelayDays: 15,
        outflowDelayDays: 0,
      },
      {
        id: "growth",
        name: "Crescita · vendite +15%",
        inflowBasisPoints: 11500,
        outflowBasisPoints: 10800,
        inflowDelayDays: 0,
        outflowDelayDays: 0,
      },
    ]);
    const counterparties = [
      "Agenzia Orizzonti",
      "Famiglia Rossi",
      "Travel Network Italia",
      "Hotel Costa del Sole",
      "Villaggio Le Palme",
      "Trasporti Tirreno",
      "Studio Associato",
      "Digital Travel",
    ];
    const tx: RecordData[] = [];
    for (let i = 0; i < 84; i++) {
      const incoming = i % 5 < 3;
      const entityId = i % 7 === 0 ? "gb-incoming" : "gb-tour";
      const accountId =
        entityId === "gb-incoming"
          ? "bpm"
          : i % 3 === 0
            ? "unicredit"
            : "intesa";
      const amount = (incoming ? 1 : -1) * (35000 + ((i * 7919) % 430000));
      tx.push({
        id: `demo-tx-${i}`,
        entityId,
        accountId,
        date: `2026-11-${String(1 + (i % 12)).padStart(2, "0")}`,
        amountMinor: amount,
        description: incoming
          ? `${i % 2 ? "Saldo" : "Acconto"} pratica VM-2026-${1100 + i}`
          : `${i % 2 ? "Saldo soggiorni" : "Acconto allotment"} novembre`,
        counterparty: counterparties[incoming ? i % 3 : 3 + (i % 5)],
        categoryId:
          i % 9 === 0
            ? undefined
            : incoming
              ? "customer-receipts"
              : i % 4 === 0
                ? "transport"
                : "supplier-payments",
        externalId: `demo-bank-${i}`,
      });
    }
    tx.push(
      {
        id: "transfer-out",
        entityId: "gb-tour",
        accountId: "intesa",
        date: "2026-11-09",
        amountMinor: -1500000,
        description: "Giroconto tesoreria",
        counterparty: "Viaggi Mediterraneo",
        categoryId: "transfers",
        transferId: "transfer-1",
      },
      {
        id: "transfer-in",
        entityId: "gb-tour",
        accountId: "unicredit",
        date: "2026-11-09",
        amountMinor: 1500000,
        description: "Giroconto tesoreria",
        counterparty: "Viaggi Mediterraneo",
        categoryId: "transfers",
        transferId: "transfer-1",
      },
    );
    put("transactions", tx);
    const destinations = [
      "Puglia · Capodanno",
      "Sicilia · Tour classico",
      "Calabria · Mare inverno",
      "Campania · Costa Amalfitana",
      "Sardegna · Pasqua",
      "Basilicata · Matera",
    ];
    for (let i = 0; i < 18; i++) {
      const departureDate = addDays("2026-12-20", i * 6);
      const bookingDate = addDays("2026-11-13", i * 2);
      const totalMinor = 480000 + i * 87000;
      const booking = {
        id: `booking-${i}`,
        entityId: "gb-tour",
        accountId: i % 2 ? "unicredit" : "intesa",
        reference: `VM-2026-${1200 + i}`,
        customer: counterparties[i % 3]!,
        destination: destinations[i % 6]!,
        departureDate,
        returnDate: addDays(departureDate, 7),
        totalMinor,
        depositBasisPoints: 3000,
        bookingDate,
        balanceDaysBefore: 30,
        supplierName: i % 2 ? "Hotel Costa del Sole" : "Villaggio Le Palme",
        supplierCostMinor: applyBasisPoints(totalMinor, 7200),
        supplierDepositBasisPoints: 2000,
        supplierBalanceDaysBefore: 14,
        status: "confirmed",
      };
      put("bookings", [booking]);
      put("obligations", scheduleBooking(booking));
    }
    const obligations: RecordData[] = [];
    for (let month = 11; month <= 16; month++) {
      const y = month > 12 ? 2027 : 2026,
        m = month > 12 ? month - 12 : month;
      const mm = String(m).padStart(2, "0");
      for (const [cat, amount, day, label] of [
        ["payroll", -1460000, "27", "Stipendi e contributi"],
        ["overhead", -245000, "05", "Affitto e servizi"],
        ["marketing", -380000, "15", "Campagne prenotazioni"],
        ["taxes", -620000, "16", "Scadenza F24 pianificata"],
      ] as const) {
        if (`${y}-${mm}-${day}` <= DEMO_DATE) continue;
        obligations.push({
          id: `recurring-${cat}-${y}-${mm}`,
          entityId: "gb-tour",
          accountId: "intesa",
          dueDate: `${y}-${mm}-${day}`,
          amountMinor: amount,
          settledMinor: 0,
          description: label,
          counterparty: label,
          categoryId: cat,
          status: "open",
        });
      }
    }
    obligations.push(
      {
        id: "overdue-agency",
        entityId: "gb-tour",
        accountId: "unicredit",
        dueDate: "2026-11-06",
        amountMinor: 1285000,
        settledMinor: 325000,
        description: "Saldo gruppo autunno · VM-2026-1081",
        counterparty: "Agenzia Orizzonti",
        categoryId: "agency-receipts",
        status: "partial",
      },
      {
        id: "refund-open",
        entityId: "gb-tour",
        accountId: "intesa",
        dueDate: "2026-11-20",
        amountMinor: -185000,
        settledMinor: 0,
        description: "Rimborso cancellazione pratica VM-2026-1090",
        counterparty: "Famiglia Verdi",
        categoryId: "refunds",
        status: "open",
      },
    );
    put("obligations", obligations);
    store.db
      .query("INSERT OR REPLACE INTO metadata VALUES('demo','true')")
      .run();
    store.db
      .query("INSERT OR REPLACE INTO metadata VALUES('asOfDate',?)")
      .run(DEMO_DATE);
  });
}
export function scheduleBooking(b: Record<string, unknown>) {
  const supplierCost = Number(b.supplierCostMinor),
    advance = applyBasisPoints(
      supplierCost,
      Number(b.supplierDepositBasisPoints),
    );
  return buildBookingSchedule({
    id: String(b.id),
    entityId: String(b.entityId),
    accountId: String(b.accountId),
    reference: String(b.reference),
    customer: String(b.customer),
    destination: String(b.destination),
    departureDate: String(b.departureDate),
    returnDate: String(b.returnDate),
    bookedDate: String(b.bookingDate),
    totalMinor: Number(b.totalMinor),
    depositBasisPoints: Number(b.depositBasisPoints),
    balanceDaysBeforeDeparture: Number(b.balanceDaysBefore),
    supplierPayments:
      supplierCost > 0
        ? [
            ...(advance > 0
              ? [
                  {
                    id: "advance",
                    supplier: String(b.supplierName),
                    amountMinor: advance,
                    dueDate: String(b.bookingDate),
                  },
                ]
              : []),
            ...(supplierCost - advance > 0
              ? [
                  {
                    id: "balance",
                    supplier: String(b.supplierName),
                    amountMinor: supplierCost - advance,
                    daysBeforeDeparture: Number(b.supplierBalanceDaysBefore),
                  },
                ]
              : []),
          ]
        : [],
  });
}
