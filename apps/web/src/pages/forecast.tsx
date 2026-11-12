import { useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  FlaskConical,
  Info,
  Plus,
} from "lucide-react";
import { CashChart } from "@/components/cash-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Amount,
  Choice,
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
  money,
  useBootstrap,
  useForecast,
  useWrite,
} from "@/lib/api";
import { useScope } from "@/lib/context";
export default function Forecast() {
  const bootstrap = useBootstrap();
  const { entityId } = useScope();
  const [scenarioId, setScenarioId] = useState("base");
  const [granularity, setGranularity] = useState("month");
  const [fromInput, setFrom] = useState("");
  const [toInput, setTo] = useState("");
  const range = defaultForecastRange(
    (bootstrap.data?.accounts ?? []).filter(
      (a) => entityId === "all" || a.entityId === entityId,
    ),
    bootstrap.data?.asOfDate ?? new Date().toISOString().slice(0, 10),
  );
  const from = fromInput || range.from;
  const to = toInput || range.to;
  const [open, setOpen] = useState(false);
  const scenarios = bootstrap.data?.scenarios ?? [];
  const selectedScenario = scenarios.find((s) => s.id === scenarioId);
  const effectiveScenario = scenarios.some((s) => s.id === scenarioId)
    ? scenarioId
    : scenarios[0]?.id;
  const query = useForecast(
    { from, to, entityId, scenarioId: effectiveScenario, granularity },
    Boolean(
      bootstrap.data?.accounts.some(
        (a) => a.enabled && (entityId === "all" || a.entityId === entityId),
      ),
    ),
  );
  if (bootstrap.isPending) return <LoadingState />;
  if (bootstrap.error)
    return (
      <ErrorState error={bootstrap.error} retry={() => bootstrap.refetch()} />
    );
  if (
    !bootstrap.data.accounts.some(
      (a) => a.enabled && (entityId === "all" || a.entityId === entityId),
    )
  )
    return (
      <EmptyState
        title="Parti da un conto"
        description="Aggiungi e attiva almeno un conto nella sezione Conti e società per creare un piano di tesoreria."
      />
    );
  const data = query.data;
  return (
    <>
      <PageHeading
        eyebrow="Guarda avanti"
        title="Piano di tesoreria"
        description="Costruisci una previsione spiegabile. Confronta le ipotesi prima di prendere una decisione."
        actions={
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Plus data-icon="inline-start" />
            Nuovo scenario
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Choice
            label="Scenario di previsione"
            value={effectiveScenario ?? "base"}
            onChange={setScenarioId}
            options={scenarios.map((s) => ({ value: s.id, label: s.name }))}
          />
          <div className="flex items-center gap-2">
            <Input
              aria-label="Data iniziale previsione"
              type="date"
              className="w-36 bg-card"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              aria-label="Data finale previsione"
              type="date"
              className="w-36 bg-card"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <ToggleGroup
          type="single"
          value={granularity}
          onValueChange={(v) => v && setGranularity(v)}
          variant="outline"
          aria-label="Raggruppamento previsione"
        >
          <ToggleGroupItem value="day">Giorni</ToggleGroupItem>
          <ToggleGroupItem value="week">Settimane</ToggleGroupItem>
          <ToggleGroupItem value="month">Mesi</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {selectedScenario &&
        (selectedScenario.inflowBasisPoints !== 10000 ||
          selectedScenario.outflowBasisPoints !== 10000 ||
          selectedScenario.inflowDelayDays !== 0 ||
          selectedScenario.outflowDelayDays !== 0) && (
          <Alert>
            <FlaskConical />
            <AlertTitle>
              Ipotesi dello scenario «{selectedScenario.name}»
            </AlertTitle>
            <AlertDescription>
              Incassi al {selectedScenario.inflowBasisPoints / 100}% con{" "}
              {selectedScenario.inflowDelayDays} giorni di ritardo. Uscite al{" "}
              {selectedScenario.outflowBasisPoints / 100}% con{" "}
              {selectedScenario.outflowDelayDays} giorni di ritardo. Il
              consuntivo resta invariato.
            </AlertDescription>
          </Alert>
        )}
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                title="Saldo iniziale"
                value={money(data.openingBalanceMinor)}
                description={dateLabel(from, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                icon={<ChartNoAxesCombined />}
              />
              <Metric
                title="Entrate del periodo"
                value={money(data.totalInflowMinor)}
                description="Consuntivo + impegni residui"
                icon={<ArrowDownLeft />}
                trend="positive"
              />
              <Metric
                title="Uscite del periodo"
                value={money(data.totalOutflowMinor)}
                description="Consuntivo + impegni residui"
                icon={<ArrowUpRight />}
              />
              <Metric
                title="Saldo finale previsto"
                value={money(data.closingBalanceMinor)}
                description={dateLabel(to, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                icon={<ChartNoAxesCombined />}
              />
            </div>
            <SectionCard
              title="Traiettoria della liquidità"
              description={`Punto minimo: ${money(data.minimumBalanceMinor)} il ${dateLabel(data.minimumBalanceDate, { day: "numeric", month: "long", year: "numeric" })}`}
              action={
                <Badge variant="outline">
                  {selectedScenario?.name ?? "Scenario base"}
                </Badge>
              }
            >
              <CashChart
                periods={data.periods}
                asOfDate={bootstrap.data.asOfDate}
                height={320}
              />
            </SectionCard>
            {data.warnings?.length > 0 && (
              <Alert>
                <Info />
                <AlertTitle>Note sul calcolo</AlertTitle>
                <AlertDescription>
                  <ul className="list-inside list-disc">
                    {data.warnings.map((w, i) => (
                      <li key={i}>
                        {typeof w === "string" ? w : JSON.stringify(w)}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <SectionCard
              title="Il piano, numero per numero"
              description="Le componenti effettive e previste sono sempre separate."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">Saldo iniziale</TableHead>
                    <TableHead className="text-right">
                      Entrate effettive
                    </TableHead>
                    <TableHead className="text-right">
                      Entrate previste
                    </TableHead>
                    <TableHead className="text-right">
                      Uscite effettive
                    </TableHead>
                    <TableHead className="text-right">
                      Uscite previste
                    </TableHead>
                    <TableHead className="text-right">Saldo finale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.periods.map((p) => (
                    <TableRow key={p.date}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">
                        {dateLabel(p.date, {
                          day: granularity === "month" ? undefined : "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      {[
                        p.openingBalanceMinor,
                        p.actualInflowMinor,
                        p.expectedInflowMinor,
                        p.actualOutflowMinor,
                        p.expectedOutflowMinor,
                        p.closingBalanceMinor,
                      ].map((v, i) => (
                        <TableCell key={i} className="text-right">
                          <Amount
                            value={v}
                            className={
                              i === 5 ? "text-xs font-semibold" : "text-xs"
                            }
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          </>
        )
      )}
      <ScenarioDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
function ScenarioDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const write = useWrite("Scenario creato");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    write.mutate(
      {
        path: "/scenarios",
        body: {
          name: form.get("name"),
          inflowBasisPoints: Math.round(Number(form.get("inflow")) * 100),
          outflowBasisPoints: Math.round(Number(form.get("outflow")) * 100),
          inflowDelayDays: Number(form.get("inflowDelay")),
          outflowDelayDays: Number(form.get("outflowDelay")),
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Un'ipotesi, non una scommessa.</DialogTitle>
          <DialogDescription>
            Modifica gli impegni previsti senza alterare il consuntivo o i dati
            originali.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="scenario-name">Nome scenario</FieldLabel>
              <Input
                id="scenario-name"
                name="name"
                required
                placeholder="Es. Incassi posticipati"
                maxLength={100}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="scenario-inflow">
                  Incassi (% della base)
                </FieldLabel>
                <Input
                  id="scenario-inflow"
                  name="inflow"
                  type="number"
                  step="1"
                  min="0"
                  max="1000"
                  defaultValue="100"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="scenario-outflow">
                  Uscite (% della base)
                </FieldLabel>
                <Input
                  id="scenario-outflow"
                  name="outflow"
                  type="number"
                  step="1"
                  min="0"
                  max="1000"
                  defaultValue="100"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="scenario-inflow-delay">
                  Ritardo incassi (giorni)
                </FieldLabel>
                <Input
                  id="scenario-inflow-delay"
                  name="inflowDelay"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue="0"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="scenario-outflow-delay">
                  Ritardo uscite (giorni)
                </FieldLabel>
                <Input
                  id="scenario-outflow-delay"
                  name="outflowDelay"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue="0"
                  required
                />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={write.isPending}>
              {write.isPending ? "Creazione..." : "Crea scenario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
