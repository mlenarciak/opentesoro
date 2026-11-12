import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Amount,
  Choice,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
  SearchInput,
  SectionCard,
} from "@/components/shared";
import {
  api,
  downloadExport,
  dateLabel,
  parseEuroInput,
  useBootstrap,
  useWrite,
  type Bootstrap,
  type Transaction,
} from "@/lib/api";
import { scopeRows, useScope } from "@/lib/context";
export default function Transactions() {
  const query = useBootstrap();
  const { entityId } = useScope();
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [category, setCategory] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const write = useWrite("Categoria aggiornata");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    setPage(0);
    setAccountId("all");
  }, [entityId]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 200);
    return () => clearTimeout(timeout);
  }, [search]);
  const params = new URLSearchParams({
    limit: "25",
    offset: String(page * 25),
  });
  for (const [key, value] of Object.entries({
    search: debouncedSearch,
    entityId,
    accountId,
    categoryId: category,
    direction,
  }))
    if (value && value !== "all") params.set(key, value);
  const transactions = useQuery({
    queryKey: ["transactions", params.toString()],
    queryFn: () =>
      api<{
        items: Transaction[];
        total: number;
        limit: number;
        offset: number;
      }>(`/transactions?${params}`),
    staleTime: 15_000,
  });
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  const total = transactions.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = transactions.data?.items ?? [];
  return (
    <>
      <PageHeading
        eyebrow="Controllo quotidiano"
        title="Movimenti"
        description="Trova ogni operazione, assegna le categorie e tieni in ordine la tua tesoreria."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadExport("csv")}>
              <Download data-icon="inline-start" />
              Esporta
            </Button>
            <Button
              disabled={!data.accounts.length}
              onClick={() => setOpen(true)}
            >
              <Plus data-icon="inline-start" />
              Nuovo movimento
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Cerca controparte o descrizione..."
        />
        <Choice
          label="Flusso"
          value={direction}
          onChange={(v) => {
            setDirection(v);
            setPage(0);
          }}
          options={[
            { value: "all", label: "Tutti i flussi" },
            { value: "inflow", label: "Entrate" },
            { value: "outflow", label: "Uscite" },
          ]}
        />
        <Choice
          label="Conto"
          value={accountId}
          onChange={(v) => {
            setAccountId(v);
            setPage(0);
          }}
          options={[
            { value: "all", label: "Tutti i conti" },
            ...scopeRows(data.accounts, entityId).map((a) => ({
              value: a.id,
              label: a.name,
            })),
          ]}
        />
        <Choice
          label="Categoria"
          value={category}
          onChange={(v) => {
            setCategory(v);
            setPage(0);
          }}
          options={[
            { value: "all", label: "Tutte le categorie" },
            { value: "uncategorized", label: "Da categorizzare" },
            ...data.categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>
      <SectionCard
        title={`${total} movimenti`}
        description="Importi effettivi registrati. Le previsioni restano nello scadenziario."
      >
        {transactions.isPending ? (
          <LoadingState />
        ) : transactions.error ? (
          <ErrorState
            error={transactions.error}
            retry={() => transactions.refetch()}
          />
        ) : rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Operazione</TableHead>
                  <TableHead>Conto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {dateLabel(tx.date, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                          {tx.amountMinor > 0 ? (
                            <ArrowDownLeft className="size-4 text-positive" />
                          ) : (
                            <ArrowUpRight className="size-4" />
                          )}
                        </span>
                        <div className="max-w-72">
                          <p className="truncate text-sm font-medium">
                            {tx.counterparty}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {tx.description}
                          </p>
                          {tx.transferId && (
                            <Badge
                              variant="outline"
                              className="mt-1 text-[10px]"
                            >
                              Giroconto
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {data.accounts.find((a) => a.id === tx.accountId)?.name ??
                        "—"}
                    </TableCell>
                    <TableCell>
                      <Choice
                        label={`Categoria di ${tx.description}`}
                        value={tx.categoryId || "none"}
                        onChange={(value) =>
                          write.mutate({
                            path: `/transactions/${tx.id}`,
                            method: "PATCH",
                            body: {
                              categoryId: value === "none" ? null : value,
                            },
                          })
                        }
                        options={[
                          { value: "none", label: "Da categorizzare" },
                          ...data.categories
                            .filter(
                              (c) =>
                                c.direction === "both" ||
                                c.direction ===
                                  (tx.amountMinor > 0 ? "inflow" : "outflow"),
                            )
                            .map((c) => ({ value: c.id, label: c.name })),
                        ]}
                        className="h-8 min-w-40 text-xs"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount
                        value={tx.amountMinor}
                        signed
                        className="text-sm"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
              <span>
                {currentPage * 25 + 1}–{Math.min((currentPage + 1) * 25, total)}{" "}
                di {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Pagina precedente"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="px-2">
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Pagina successiva"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </SectionCard>
      <TransactionDialog data={data} open={open} onOpenChange={setOpen} />
    </>
  );
}
function TransactionDialog({
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
  const write = useWrite("Movimento registrato");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const amountMinor =
        Math.abs(parseEuroInput(String(form.get("amount")))) *
        (direction === "inflow" ? 1 : -1);
      const account = data.accounts.find((a) => a.id === chosenAccount);
      if (!account) throw new Error("Seleziona un conto.");
      write.mutate(
        {
          path: "/transactions",
          body: {
            entityId: account.entityId,
            accountId: chosenAccount,
            date: form.get("date"),
            description: form.get("description"),
            counterparty: form.get("counterparty"),
            amountMinor,
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
          <DialogTitle>Registra un movimento</DialogTitle>
          <DialogDescription>
            Aggiungi un'operazione effettiva al conto selezionato.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel>Conto</FieldLabel>
              <Choice
                label="Conto del movimento"
                value={chosenAccount}
                onChange={setAccountId}
                options={data.accounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel>Direzione</FieldLabel>
              <Choice
                label="Direzione del movimento"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: "inflow", label: "Entrata" },
                  { value: "outflow", label: "Uscita" },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tx-amount">Importo (€)</FieldLabel>
              <Input
                id="tx-amount"
                name="amount"
                inputMode="decimal"
                placeholder="1.250,00 → inserisci 1250,00"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tx-date">Data operazione</FieldLabel>
              <Input
                id="tx-date"
                name="date"
                type="date"
                defaultValue={data.asOfDate}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tx-counterparty">Controparte</FieldLabel>
              <Input
                id="tx-counterparty"
                name="counterparty"
                required
                maxLength={200}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tx-description">Descrizione</FieldLabel>
              <Input
                id="tx-description"
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
              {write.isPending ? "Salvataggio..." : "Registra movimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
