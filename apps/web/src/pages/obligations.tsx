import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addMinor, minorToDecimal } from "@opentesoro/engine";
import type { Page, Transaction } from "@opentesoro/sdk";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  Link2,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  api,
  dateLabel,
  isOpen,
  money,
  parseEuroInput,
  remaining,
  useBootstrap,
  useWrite,
  type Bootstrap,
  type Obligation,
} from "@/lib/api";
import { scopeRows, useScope } from "@/lib/context";
export default function Obligations() {
  const query = useBootstrap();
  const { entityId } = useScope();
  const [direction, setDirection] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [open, setOpen] = useState(false);
  const [reconcile, setReconcile] = useState<Obligation | null>(null);
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  const all = scopeRows(data.obligations, entityId);
  const active = all.filter(isOpen);
  const rows = [...all]
    .filter(
      (o) =>
        (direction === "all" ||
          (direction === "inflow" ? o.amountMinor > 0 : o.amountMinor < 0)) &&
        (status === "all" ||
          (status === "open"
            ? isOpen(o)
            : status === "overdue"
              ? isOpen(o) && o.dueDate < data.asOfDate
              : o.status === status)) &&
        `${o.description} ${o.counterparty}`
          .toLocaleLowerCase("it")
          .includes(search.toLocaleLowerCase("it")),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = active.filter((o) => o.dueDate < data.asOfDate);
  return (
    <>
      <PageHeading
        eyebrow="Nessuna sorpresa"
        title="Scadenziario"
        description="Incassi e pagamenti attesi. Collega gli impegni ai movimenti effettivi, anche in più tranche."
        actions={
          <Button
            disabled={!data.accounts.length}
            onClick={() => setOpen(true)}
          >
            <Plus data-icon="inline-start" />
            Nuova scadenza
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          title="Crediti da incassare"
          value={money(
            active
              .filter((o) => o.amountMinor > 0)
              .reduce((s, o) => s + remaining(o), 0),
          )}
          description="Totale residuo aperto"
          icon={<ArrowDownLeft />}
          trend="positive"
        />
        <Metric
          title="Debiti da pagare"
          value={money(
            active
              .filter((o) => o.amountMinor < 0)
              .reduce((s, o) => s + remaining(o), 0),
          )}
          description="Totale residuo aperto"
          icon={<ArrowUpRight />}
        />
        <Metric
          title="Scadenze superate"
          value={money(overdue.reduce((s, o) => s + remaining(o), 0))}
          description={`${overdue.length} impegni da verificare`}
          icon={<CalendarClock />}
          trend={overdue.length ? "negative" : undefined}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cerca controparte o scadenza..."
          />
          <Choice
            label="Stato scadenza"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Da completare" },
              { value: "overdue", label: "Scadute" },
              { value: "settled", label: "Saldate" },
              { value: "all", label: "Tutti gli stati" },
            ]}
          />
        </div>
        <ToggleGroup
          type="single"
          value={direction}
          onValueChange={(v) => v && setDirection(v)}
          variant="outline"
        >
          <ToggleGroupItem value="all">Tutte</ToggleGroupItem>
          <ToggleGroupItem value="inflow">Incassi</ToggleGroupItem>
          <ToggleGroupItem value="outflow">Pagamenti</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <SectionCard
        title={`${rows.length} scadenze`}
        description="I residui alimentano automaticamente le previsioni di cassa."
      >
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scadenza</TableHead>
                <TableHead>Controparte / descrizione</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead className="text-right">Residuo</TableHead>
                <TableHead className="text-right">Azione</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    <span
                      className={
                        isOpen(o) && o.dueDate < data.asOfDate
                          ? "text-negative"
                          : "text-muted-foreground"
                      }
                    >
                      {dateLabel(o.dueDate, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{o.counterparty}</p>
                    <p className="mt-1 max-w-80 truncate text-xs text-muted-foreground">
                      {o.description}
                    </p>
                    {o.bookingId && (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        Da prenotazione
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={o.status === "settled" ? "secondary" : "outline"}
                    >
                      {o.status === "settled"
                        ? "Saldata"
                        : o.status === "cancelled"
                          ? "Annullata"
                          : o.status === "partial"
                            ? "Parziale"
                            : o.dueDate < data.asOfDate
                              ? "Scaduta"
                              : "Aperta"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={o.amountMinor} signed className="text-xs" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount
                      value={(o.amountMinor > 0 ? 1 : -1) * remaining(o)}
                      signed
                      className="text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {isOpen(o) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReconcile(o)}
                      >
                        <Link2 data-icon="inline-start" />
                        Riconcilia
                      </Button>
                    ) : (
                      <Check className="ml-auto size-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="Tutto sotto controllo"
            description="Nessuna scadenza corrisponde ai filtri selezionati."
          />
        )}
      </SectionCard>
      <ObligationDialog data={data} open={open} onOpenChange={setOpen} />
      <ReconciliationDialog
        data={data}
        obligation={reconcile}
        onClose={() => setReconcile(null)}
      />
    </>
  );
}
function ObligationDialog({
  data,
  open,
  onOpenChange,
}: {
  data: Bootstrap;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const [direction, setDirection] = useState("inflow");
  const chosenAccount = accountId || data.accounts[0]?.id || "";
  const [error, setError] = useState("");
  const write = useWrite("Scadenza creata");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const account = data.accounts.find((a) => a.id === chosenAccount);
      if (!account) throw new Error("Seleziona un conto.");
      const amountMinor =
        Math.abs(parseEuroInput(String(form.get("amount")))) *
        (direction === "inflow" ? 1 : -1);
      write.mutate(
        {
          path: "/obligations",
          body: {
            entityId: account.entityId,
            accountId: chosenAccount,
            dueDate: form.get("date"),
            amountMinor,
            settledMinor: 0,
            status: "open",
            description: form.get("description"),
            counterparty: form.get("counterparty"),
          },
        },
        { onSuccess: () => onOpenChange(false) },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova scadenza</DialogTitle>
          <DialogDescription>
            Un impegno atteso che entra nel piano di tesoreria.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel>Conto</FieldLabel>
              <Choice
                label="Conto della scadenza"
                value={chosenAccount}
                onChange={setAccountId}
                options={data.accounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel>Tipo di impegno</FieldLabel>
              <Choice
                label="Tipo di impegno"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: "inflow", label: "Incasso da cliente" },
                  { value: "outflow", label: "Pagamento a fornitore" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="ob-amount">Importo (€)</FieldLabel>
                <Input
                  id="ob-amount"
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="1250,00"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ob-date">Scadenza</FieldLabel>
                <Input
                  id="ob-date"
                  name="date"
                  type="date"
                  defaultValue={data.asOfDate}
                  required
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ob-counterparty">Controparte</FieldLabel>
              <Input
                id="ob-counterparty"
                name="counterparty"
                required
                maxLength={200}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ob-description">Descrizione</FieldLabel>
              <Input
                id="ob-description"
                name="description"
                required
                maxLength={500}
              />
            </Field>
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
              {write.isPending ? "Salvataggio..." : "Crea scadenza"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function ReconciliationDialog({
  data,
  obligation,
  onClose,
}: {
  data: Bootstrap;
  obligation: Obligation | null;
  onClose: () => void;
}) {
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [candidatePage, setCandidatePage] = useState(0);
  const write = useWrite("Movimento riconciliato");
  const { reset } = write;
  useEffect(() => {
    setTransactionId("");
    setAmount("");
    setAmountEdited(false);
    setSearch("");
    setDebouncedSearch("");
    setCandidatePage(0);
    reset();
  }, [obligation?.id, reset]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setCandidatePage(0);
    }, 200);
    return () => clearTimeout(timeout);
  }, [search]);
  const params = new URLSearchParams({
    limit: "100",
    offset: String(candidatePage * 100),
  });
  if (obligation) {
    params.set("entityId", obligation.entityId);
    params.set("direction", obligation.amountMinor > 0 ? "inflow" : "outflow");
    if (obligation.accountId) params.set("accountId", obligation.accountId);
  }
  if (debouncedSearch) params.set("search", debouncedSearch);
  const transactions = useQuery({
    queryKey: [
      "reconciliation-transactions",
      obligation?.id,
      params.toString(),
      data.revision,
    ],
    queryFn: () => api<Page<Transaction>>(`/transactions?${params}`),
    enabled: Boolean(obligation),
    staleTime: 0,
  });
  const allocations = useMemo(() => {
    const map = new Map<string, number>();
    for (const settlement of data.settlements)
      map.set(
        settlement.transactionId,
        addMinor(
          map.get(settlement.transactionId) ?? 0,
          settlement.amountMinor,
        ),
      );
    return map;
  }, [data.settlements]);
  const candidates = (transactions.data?.items ?? [])
    .filter((tx) => !tx.transferId)
    .map((tx) => ({
      ...tx,
      availableMinor: addMinor(
        Math.abs(tx.amountMinor),
        -(allocations.get(tx.id) ?? 0),
      ),
    }))
    .filter((tx) => tx.availableMinor > 0);
  const selected = candidates.find((tx) => tx.id === transactionId);
  const suggestions = useQuery({
    queryKey: ["reconciliation", transactionId, obligation?.id, data.revision],
    queryFn: () =>
      api<{
        items: {
          obligationId: string;
          score: number;
          amountMinor: number;
          reasons: string[];
        }[];
      }>(
        `/reconciliation/suggestions?transactionId=${encodeURIComponent(transactionId)}`,
      ),
    enabled: Boolean(selected && obligation),
  });
  const match = suggestions.data?.items.find(
    (item) => item.obligationId === obligation?.id,
  );
  useEffect(() => {
    if (match && !amountEdited) setAmount(minorToDecimal(match.amountMinor));
  }, [match?.amountMinor, transactionId, amountEdited]);
  const chooseTransaction = (id: string) => {
    setTransactionId(id === "choose" ? "" : id);
    setAmountEdited(false);
    const tx = candidates.find((candidate) => candidate.id === id);
    setAmount(
      tx && obligation
        ? minorToDecimal(Math.min(tx.availableMinor, remaining(obligation)))
        : "",
    );
  };
  const clearSelection = () => {
    setTransactionId("");
    setAmount("");
    setAmountEdited(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!obligation || !selected) return;
    try {
      const amountMinor = parseEuroInput(amount);
      if (
        amountMinor <= 0 ||
        amountMinor > Math.min(selected.availableMinor, remaining(obligation))
      )
        throw new Error(
          "L’importo deve essere positivo e non può superare il residuo o la disponibilità del movimento.",
        );
      write.mutate(
        {
          path: "/reconciliation",
          body: { transactionId, obligationId: obligation.id, amountMinor },
        },
        {
          onSuccess: () => {
            clearSelection();
            onClose();
          },
        },
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <Dialog
      open={Boolean(obligation)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collega un movimento effettivo</DialogTitle>
          <DialogDescription>
            {obligation?.counterparty} · residuo{" "}
            {money(obligation ? remaining(obligation) : 0)}. Cerca nei movimenti
            del conto, poi riconcilia anche un importo parziale.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rec-search">
                Cerca movimento da riconciliare
              </FieldLabel>
              <Input
                id="rec-search"
                value={search}
                placeholder="Controparte o descrizione"
                onChange={(event) => {
                  setSearch(event.target.value);
                  clearSelection();
                }}
              />
            </Field>
            {transactions.isLoading ? (
              <p role="status" className="text-xs text-muted-foreground">
                Ricerca dei movimenti disponibili...
              </p>
            ) : transactions.error ? (
              <ErrorState
                error={transactions.error}
                retry={() => transactions.refetch()}
              />
            ) : !candidates.length ? (
              <p role="status" className="text-xs text-muted-foreground">
                Nessun movimento con disponibilità residua in questi risultati.
                Modifica la ricerca
                {(transactions.data?.total ?? 0) > 100
                  ? " o cambia pagina"
                  : ""}
                .
              </p>
            ) : (
              <Field>
                <FieldLabel>Movimento bancario</FieldLabel>
                <Choice
                  label="Movimento da riconciliare"
                  disabled={
                    transactions.isFetching || search !== debouncedSearch
                  }
                  value={transactionId || "choose"}
                  onChange={chooseTransaction}
                  options={[
                    { value: "choose", label: "Seleziona un movimento" },
                    ...candidates.map((tx) => ({
                      value: tx.id,
                      label: `${dateLabel(tx.date)} · ${tx.counterparty} · disponibile ${money(tx.availableMinor)}`,
                    })),
                  ]}
                />
              </Field>
            )}
            {(transactions.data?.total ?? 0) > 100 && (
              <div className="flex items-center justify-between gap-3 text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!candidatePage}
                  onClick={() => {
                    setCandidatePage((page) => page - 1);
                    clearSelection();
                  }}
                >
                  Precedenti
                </Button>
                <span>
                  Pagina {candidatePage + 1} di{" "}
                  {Math.ceil((transactions.data?.total ?? 0) / 100)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    (candidatePage + 1) * 100 >= (transactions.data?.total ?? 0)
                  }
                  onClick={() => {
                    setCandidatePage((page) => page + 1);
                    clearSelection();
                  }}
                >
                  Successivi
                </Button>
              </div>
            )}
            {selected && (
              <p className="text-xs text-muted-foreground">
                Disponibile su questo movimento:{" "}
                {money(selected.availableMinor)}. Gli importi già allocati sono
                esclusi.
              </p>
            )}
            {suggestions.isFetching && selected && (
              <p role="status" className="text-xs text-muted-foreground">
                Verifica della corrispondenza...
              </p>
            )}
            {suggestions.error && selected && (
              <p role="alert" className="text-xs text-destructive">
                Impossibile verificare la proposta: {suggestions.error.message}
              </p>
            )}
            {match && (
              <p className="text-xs text-muted-foreground">
                Proposta verificata: {money(match.amountMinor)} · punteggio{" "}
                {match.score} · {match.reasons.join(", ")}
              </p>
            )}
            <Field>
              <FieldLabel htmlFor="rec-amount">
                Importo da riconciliare (€)
              </FieldLabel>
              <Input
                id="rec-amount"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setAmountEdited(true);
                }}
                inputMode="decimal"
                required
                disabled={!selected}
              />
            </Field>
          </FieldGroup>
          {write.error && (
            <p role="alert" className="text-xs text-destructive">
              {write.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={!selected || write.isPending || suggestions.isFetching}
            >
              Conferma riconciliazione
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
