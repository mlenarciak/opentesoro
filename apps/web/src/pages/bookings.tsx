import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Plane,
  Plus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Amount,
  Choice,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeading,
  SearchInput,
  SectionCard,
} from "@/components/shared";
import {
  dateLabel,
  isOpen,
  money,
  parseEuroInput,
  remaining,
  useBootstrap,
  useWrite,
  type Bootstrap,
  type Booking,
} from "@/lib/api";
import { scopeRows, useScope } from "@/lib/context";
export default function Bookings() {
  const query = useBootstrap();
  const { entityId } = useScope();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  const all = scopeRows(data.bookings, entityId);
  const bookings = all
    .filter((b) =>
      `${b.reference} ${b.customer} ${b.destination}`
        .toLocaleLowerCase("it")
        .includes(search.toLocaleLowerCase("it")),
    )
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  const active = all.filter((b) => b.status !== "cancelled");
  return (
    <>
      <PageHeading
        eyebrow="Pensato per chi organizza viaggi"
        title="Viaggi e prenotazioni"
        description="Dalla conferma alla partenza: acconti, saldi clienti e impegni con i fornitori nello stesso flusso."
        actions={
          <Button
            disabled={!data.accounts.length}
            onClick={() => setOpen(true)}
          >
            <Plus data-icon="inline-start" />
            Nuova prenotazione
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          title="Prenotazioni confermate"
          value={String(active.length)}
          description="Portafoglio viaggi attivo"
          icon={<Plane />}
        />
        <Metric
          title="Valore delle prenotazioni"
          value={money(active.reduce((s, b) => s + b.totalMinor, 0))}
          description="Vendite confermate · importi lordi"
          icon={<Users />}
        />
        <Metric
          title="Impegni verso i fornitori"
          value={money(active.reduce((s, b) => s + b.supplierCostMinor, 0))}
          description="Costo contrattuale dei servizi"
          icon={<CalendarDays />}
        />
      </div>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Cerca riferimento, cliente o destinazione..."
      />
      <SectionCard
        title="Il portafoglio viaggi"
        description="Apri una prenotazione per consultare il calendario finanziario."
      >
        {bookings.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Viaggio / riferimento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Partenza</TableHead>
                <TableHead className="text-right">Valore vendita</TableHead>
                <TableHead>Incassato</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const obs = data.obligations.filter(
                  (o) =>
                    o.bookingId === b.id &&
                    o.amountMinor > 0 &&
                    o.status !== "cancelled",
                );
                const settled = obs.reduce((s, o) => s + o.settledMinor, 0);
                const percent =
                  b.totalMinor > 0
                    ? Math.min(100, (settled / b.totalMinor) * 100)
                    : 0;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                          <MapPin className="size-4" />
                        </span>
                        <div>
                          <p className="text-sm font-medium">{b.destination}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {b.reference}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{b.customer}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {dateLabel(b.departureDate, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={b.totalMinor} className="text-sm" />
                    </TableCell>
                    <TableCell>
                      <div className="flex w-28 flex-col gap-2">
                        <div className="flex justify-between text-xs">
                          <span>{money(settled)}</span>
                          <span className="text-muted-foreground">
                            {Math.round(percent)}%
                          </span>
                        </div>
                        <Progress value={percent} className="h-1" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Dettagli ${b.reference}`}
                        onClick={() => setSelected(b)}
                      >
                        <ArrowRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="Il prossimo viaggio inizia qui"
            description="Crea una prenotazione per generare automaticamente le scadenze di clienti e fornitori."
          />
        )}
      </SectionCard>
      <SectionCard
        title="Un viaggio, un calendario finanziario"
        description="Le condizioni commerciali diventano automaticamente impegni di tesoreria."
      >
        <div className="grid gap-5 md:grid-cols-4">
          {[
            {
              n: "01",
              title: "Conferma",
              text: "La prenotazione fissa il valore del viaggio e i costi dei servizi.",
            },
            {
              n: "02",
              title: "Acconto cliente",
              text: "La percentuale concordata genera una prima scadenza di incasso.",
            },
            {
              n: "03",
              title: "Saldi e fornitori",
              text: "Scadenze relative alla partenza, con anticipi separati per i fornitori.",
            },
            {
              n: "04",
              title: "Incasso effettivo",
              text: "La riconciliazione aggiorna i residui e il piano di cassa.",
            },
          ].map((s) => (
            <div key={s.n} className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {s.n}
              </span>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
      <BookingDialog data={data} open={open} onOpenChange={setOpen} />
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(v) => !v && setSelected(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selected?.destination} · {selected?.reference}
            </DialogTitle>
            <DialogDescription>
              {selected?.customer} · Partenza{" "}
              {selected &&
                dateLabel(selected.departureDate, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Impegno</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead className="text-right">Residuo</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.obligations
                .filter((o) => o.bookingId === selected?.id)
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs">{o.description}</TableCell>
                    <TableCell className="text-xs">
                      {dateLabel(o.dueDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount
                        value={(o.amountMinor > 0 ? 1 : -1) * remaining(o)}
                        signed
                        className="text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {isOpen(o) ? "Aperta" : "Saldata"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function BookingDialog({
  data,
  open,
  onOpenChange,
}: {
  data: Bootstrap;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const chosenAccount = accountId || data.accounts[0]?.id || "";
  const [error, setError] = useState("");
  const write = useWrite("Prenotazione e scadenze create");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const account = data.accounts.find((a) => a.id === chosenAccount);
      if (!account) throw new Error("Seleziona un conto.");
      write.mutate(
        {
          path: "/bookings",
          body: {
            entityId: account.entityId,
            accountId: chosenAccount,
            reference: form.get("reference"),
            customer: form.get("customer"),
            destination: form.get("destination"),
            departureDate: form.get("departureDate"),
            returnDate: form.get("returnDate"),
            bookingDate: form.get("bookingDate"),
            totalMinor: parseEuroInput(String(form.get("total"))),
            depositBasisPoints: Math.round(Number(form.get("deposit")) * 100),
            balanceDaysBefore: Number(form.get("balanceDays")),
            supplierName: form.get("supplierName"),
            supplierCostMinor: parseEuroInput(
              String(form.get("supplierCost") || "0"),
            ),
            supplierDepositBasisPoints: Math.round(
              Number(form.get("supplierDeposit")) * 100,
            ),
            supplierBalanceDaysBefore: Number(form.get("supplierBalanceDays")),
            status: "confirmed",
          },
        },
        { onSuccess: () => onOpenChange(false) },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const field = (
    name: string,
    label: string,
    type = "text",
    value?: string | number,
  ) => (
    <Field>
      <FieldLabel htmlFor={`booking-${name}`}>{label}</FieldLabel>
      <Input
        id={`booking-${name}`}
        name={name}
        type={type}
        defaultValue={value}
        required={name !== "supplierName"}
        min={type === "number" ? 0 : undefined}
        max={type === "number" ? 365 : undefined}
      />
    </Field>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuova prenotazione</DialogTitle>
          <DialogDescription>
            Le scadenze di acconto e saldo vengono generate insieme alla
            prenotazione.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel>Conto di riferimento</FieldLabel>
              <Choice
                label="Conto prenotazione"
                value={chosenAccount}
                onChange={setAccountId}
                options={data.accounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("reference", "Riferimento pratica")}
              {field("customer", "Cliente")}
              {field("destination", "Destinazione")}
              {field("bookingDate", "Data conferma", "date", data.asOfDate)}
              {field("departureDate", "Partenza", "date")}
              {field("returnDate", "Rientro", "date")}
              {field("total", "Valore vendita (€)", "text")}
              {field("deposit", "Acconto cliente (%)", "number", 30)}
              {field(
                "balanceDays",
                "Saldo cliente: giorni prima",
                "number",
                30,
              )}
              {field("supplierName", "Fornitore principale")}
              {field("supplierCost", "Costo fornitore (€)", "text", "0")}
              {field("supplierDeposit", "Acconto fornitore (%)", "number", 20)}
              {field(
                "supplierBalanceDays",
                "Saldo fornitore: giorni prima",
                "number",
                14,
              )}
            </div>
          </FieldGroup>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={write.isPending}>
              {write.isPending
                ? "Creazione..."
                : "Crea prenotazione e scadenze"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
