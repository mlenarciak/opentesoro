import { Link } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  CircleAlert,
  Landmark,
  Plane,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { CashChart } from "@/components/cash-chart";
import {
  Amount,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeading,
  SectionCard,
} from "@/components/shared";
import {
  dateLabel,
  defaultForecastRange,
  isOpen,
  money,
  remaining,
  useBootstrap,
  useDashboard,
  useForecast,
} from "@/lib/api";
import { scopeRows, useScope } from "@/lib/context";
export default function Overview() {
  const query = useBootstrap();
  const { entityId } = useScope();
  const dashboard = useDashboard(entityId);
  const range = defaultForecastRange(
    scopeRows(query.data?.accounts ?? [], entityId),
    query.data?.asOfDate ?? new Date().toISOString().slice(0, 10),
  );
  const forecast = useForecast(
    { ...range, entityId, granularity: "week" },
    Boolean(
      scopeRows(query.data?.accounts ?? [], entityId).some((a) => a.enabled),
    ),
  );
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  if (!scopeRows(data.accounts, entityId).length)
    return (
      <>
        <PageHeading
          eyebrow="Benvenuto in OpenTesoro"
          title="La tua tesoreria parte da qui."
          description="Crea la prima società e aggiungi un conto con il saldo di riferimento. Poi importa i movimenti e pianifica gli impegni."
          actions={
            <Button asChild>
              <Link to="/conti">
                Configura società e conti
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          }
        />
        <EmptyState
          title="Un workspace tutto tuo"
          description="Nessun dato di esempio. Società, conti e movimenti verranno salvati nel tuo database locale."
        />
      </>
    );
  const accounts = scopeRows(data.accounts, entityId).filter((a) => a.enabled);
  const transactions = scopeRows(data.transactions, entityId);
  const obligations = scopeRows(data.obligations, entityId).filter(isOpen);
  const balance =
    accounts.reduce((sum, a) => sum + a.balanceMinor, 0) +
    transactions
      .filter(
        (t) =>
          t.date <= data.asOfDate &&
          accounts.some((a) => a.id === t.accountId && t.date > a.asOfDate),
      )
      .reduce((sum, t) => sum + t.amountMinor, 0);
  const upcoming = obligations.filter(
    (o) =>
      o.dueDate >= data.asOfDate &&
      o.dueDate <=
        new Date(
          new Date(data.asOfDate + "T12:00:00Z").getTime() + 30 * 86400000,
        )
          .toISOString()
          .slice(0, 10),
  );
  const inflow = upcoming
    .filter((o) => o.amountMinor > 0)
    .reduce((s, o) => s + remaining(o), 0);
  const outflow = upcoming
    .filter((o) => o.amountMinor < 0)
    .reduce((s, o) => s + remaining(o), 0);
  const overdue = obligations.filter((o) => o.dueDate < data.asOfDate);
  const latest = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const due = [...obligations]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  return (
    <>
      <PageHeading
        eyebrow="Il quadro completo"
        title="Ogni decisione parte dalla chiarezza."
        description="Liquidità, impegni e prossime partenze. Tutto quello che conta, in un unico posto."
        actions={
          <Button variant="outline" asChild>
            <Link to="/previsioni">
              <ChartNoAxesCombined data-icon="inline-start" />
              Esplora le previsioni
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Liquidità disponibile"
          value={dashboard.data ? money(dashboard.data.balanceMinor) : "—"}
          description={`${accounts.length} conti attivi · saldo al ${dateLabel(data.asOfDate)}`}
          icon={<Wallet />}
        />
        <Metric
          title="Incassi previsti"
          value={money(inflow)}
          description="Nei prossimi 30 giorni"
          icon={<ArrowDownLeft />}
          trend="positive"
        />
        <Metric
          title="Pagamenti previsti"
          value={money(outflow)}
          description="Nei prossimi 30 giorni"
          icon={<ArrowUpRight />}
        />
        <Metric
          title="Liquidità minima prevista"
          value={forecast.data ? money(forecast.data.minimumBalanceMinor) : "—"}
          description={
            forecast.data
              ? `${dateLabel(forecast.data.minimumBalanceDate, { day: "numeric", month: "long" })} · orizzonte 6 mesi`
              : "Calcolo del piano di tesoreria"
          }
          icon={<ChartNoAxesCombined />}
          trend={
            forecast.data && forecast.data.minimumBalanceMinor < 0
              ? "negative"
              : undefined
          }
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <SectionCard
          title="La tua liquidità, nel tempo"
          description={`Consuntivo e impegni residui · ${dateLabel(range.from, { month: "short", year: "numeric" })} – ${dateLabel(range.to, { month: "short", year: "numeric" })}`}
          action={<Badge variant="secondary">Scenario base</Badge>}
        >
          {forecast.isPending ? (
            <LoadingState />
          ) : forecast.error ? (
            <ErrorState
              error={forecast.error}
              retry={() => forecast.refetch()}
            />
          ) : (
            <CashChart
              periods={forecast.data.periods}
              asOfDate={data.asOfDate}
            />
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-chart-1" />
              Saldo di tesoreria
            </span>
            <Link
              to="/previsioni"
              className="flex items-center gap-1.5 font-medium text-foreground"
            >
              Apri il piano completo
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </SectionCard>
        <SectionCard
          title="Da tenere d'occhio"
          description="I segnali utili, senza rumore"
        >
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <CircleAlert className="size-4 text-warning" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {overdue.length} scadenze da verificare
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {money(overdue.reduce((s, o) => s + remaining(o), 0))} di
                  impegni oltre la data prevista.
                </p>
                <Link
                  to="/scadenze"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                >
                  Rivedi scadenze
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Plane className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  Una vista sul tuo business
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Acconti clienti e saldi fornitori collegati alle prenotazioni.
                </p>
                <Link
                  to="/prenotazioni"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                >
                  Esplora i viaggi
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
            <div className="rounded-lg bg-positive-muted p-3.5">
              <p className="text-xs font-medium text-positive">
                La previsione è spiegabile.
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Ogni importo deriva da un movimento o da una scadenza. Gli
                incassi già riconciliati non vengono contati due volte.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          title="Ultimi movimenti"
          description="Le operazioni registrate sui tuoi conti"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/movimenti">
                Tutti
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          }
        >
          {latest.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operazione</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                          {tx.amountMinor > 0 ? (
                            <ArrowDownLeft className="size-3.5 text-positive" />
                          ) : (
                            <ArrowUpRight className="size-3.5" />
                          )}
                        </span>
                        <div className="max-w-56">
                          <p className="truncate text-xs font-medium">
                            {tx.counterparty}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            {tx.description}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {dateLabel(tx.date)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount
                        value={tx.amountMinor}
                        signed
                        className="text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState />
          )}
        </SectionCard>
        <SectionCard
          title="Prossime scadenze"
          description="Gli impegni che meritano attenzione"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/scadenze">
                Tutte
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          }
        >
          {due.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Controparte</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="text-right">Residuo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {due.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <p className="max-w-52 truncate text-xs font-medium">
                        {o.counterparty}
                      </p>
                      <p className="mt-1 max-w-52 truncate text-[11px] text-muted-foreground">
                        {o.description}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={
                          o.dueDate < data.asOfDate
                            ? "text-negative"
                            : "text-muted-foreground"
                        }
                      >
                        {dateLabel(o.dueDate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount
                        value={o.amountMinor > 0 ? remaining(o) : -remaining(o)}
                        signed
                        className="text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState />
          )}
        </SectionCard>
      </div>
    </>
  );
}
