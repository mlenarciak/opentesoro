import type { Store } from "./store";
/** Stable defaults used by booking schedules, installed without creating business data. */
export function ensureReferenceData(store: Store) {
  store.atomic(() => {
    for (const category of [
      { id: "customer-receipts", name: "Incassi clienti", direction: "inflow" },
      {
        id: "supplier-payments",
        name: "Hotel e strutture",
        direction: "outflow",
      },
      { id: "transport", name: "Trasporti e voli", direction: "outflow" },
      { id: "refunds", name: "Rimborsi clienti", direction: "outflow" },
      { id: "payroll", name: "Personale", direction: "outflow" },
      { id: "taxes", name: "Imposte e contributi", direction: "outflow" },
      { id: "overhead", name: "Costi operativi", direction: "outflow" },
      { id: "marketing", name: "Marketing", direction: "outflow" },
      { id: "transfers", name: "Giroconti", direction: "both" },
    ])
      if (!store.get("categories", category.id))
        store.put("categories", category, "system-reference");
  });
}
