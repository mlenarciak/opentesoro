import { useState, type FormEvent } from "react";
import { Building2, Landmark, Plus, Wallet } from "lucide-react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Amount,
  Choice,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeading,
  SectionCard,
} from "@/components/shared";
import {
  dateLabel,
  parseEuroInput,
  useDashboard,
  useBootstrap,
  useWrite,
  type Bootstrap,
} from "@/lib/api";
import { scopeRows, useScope } from "@/lib/context";
export default function Accounts() {
  const query = useBootstrap();
  const { entityId } = useScope();
  const dashboard = useDashboard(entityId);
  const [open, setOpen] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const write = useWrite("Conto aggiornato");
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  const accounts = scopeRows(data.accounts, entityId);
  const entities =
    entityId === "all"
      ? data.entities
      : data.entities.filter((e) => e.id === entityId);
  return (
    <>
      <PageHeading
        eyebrow="Una sola vista, più società"
        title="Conti e società"
        description="Saldi di riferimento e movimenti successivi: una posizione di cassa sempre ricostruibile."
        actions={
          <>
            <Button variant="outline" onClick={() => setEntityOpen(true)}>
              <Building2 data-icon="inline-start" />
              Nuova società
            </Button>
            <Button
              disabled={!data.entities.length}
              onClick={() => setOpen(true)}
            >
              <Plus data-icon="inline-start" />
              Aggiungi conto
            </Button>
          </>
        }
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => {
          const current = dashboard.data?.accounts?.find(
            (a) => a.id === account.id,
          )?.currentBalanceMinor;
          const after =
            current === undefined ? undefined : current - account.balanceMinor;
          return (
            <Card key={account.id} className="gap-5 shadow-none">
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg border bg-secondary">
                    <Landmark className="size-5" />
                  </span>
                  <Badge variant={account.enabled ? "secondary" : "outline"}>
                    {account.enabled ? "Attivo" : "Escluso dal piano"}
                  </Badge>
                </div>
                <CardTitle className="text-base">{account.name}</CardTitle>
                <CardDescription>
                  {account.bank} ·{" "}
                  {data.entities.find((e) => e.id === account.entityId)?.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {current === undefined ? (
                  <span className="text-2xl text-muted-foreground">—</span>
                ) : (
                  <Amount
                    value={current}
                    className="text-2xl font-semibold tracking-tight"
                  />
                )}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Posizione al{" "}
                  {dateLabel(data.asOfDate, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <div className="mt-5 flex flex-col gap-2 border-t pt-4 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      Saldo di riferimento · {dateLabel(account.asOfDate)}
                    </span>
                    <Amount value={account.balanceMinor} />
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      Movimenti successivi
                    </span>
                    {after === undefined ? (
                      <span>—</span>
                    ) : (
                      <Amount value={after} signed />
                    )}
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Valuta</span>
                    <span>{account.currency}</span>
                  </div>
                </div>
                <Button
                  className="mt-5 w-full"
                  variant="outline"
                  size="sm"
                  disabled={write.isPending}
                  onClick={() =>
                    write.mutate({
                      path: `/accounts/${account.id}`,
                      method: "PATCH",
                      body: { enabled: !account.enabled },
                    })
                  }
                >
                  {account.enabled
                    ? "Escludi dalle previsioni"
                    : "Includi nelle previsioni"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!accounts.length && (
        <EmptyState
          title="Nessun conto presente"
          description={
            data.entities.length
              ? "Aggiungi un conto e il saldo di riferimento per iniziare."
              : "Crea prima una società con il pulsante Nuova società. Potrai poi aggiungere i suoi conti."
          }
        />
      )}
      <SectionCard
        title="Le tue società"
        description="Dati separati per società. Consolidamento esplicito per valuta."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {entities.map((entity) => (
            <div
              key={entity.id}
              className="flex items-center gap-4 rounded-lg border p-4"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <Building2 className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">{entity.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.accounts.filter((a) => a.entityId === entity.id).length}{" "}
                  conti · Valuta funzionale {entity.currency}
                </p>
              </div>
              <Badge variant="outline" className="ml-auto">
                Italia
              </Badge>
            </div>
          ))}
        </div>
      </SectionCard>
      <AccountDialog data={data} open={open} onOpenChange={setOpen} />
      <EntityDialog open={entityOpen} onOpenChange={setEntityOpen} />
    </>
  );
}
function AccountDialog({
  data,
  open,
  onOpenChange,
}: {
  data: Bootstrap;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [entityId, setEntityId] = useState(data.entities[0]?.id ?? "");
  const [error, setError] = useState("");
  const write = useWrite("Conto creato");
  const chosenEntity = entityId || data.entities[0]?.id || "";
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      write.mutate(
        {
          path: "/accounts",
          body: {
            entityId: chosenEntity,
            name: form.get("name"),
            bank: form.get("bank"),
            currency: "EUR",
            balanceMinor: parseEuroInput(String(form.get("balance"))),
            asOfDate: form.get("asOfDate"),
            enabled: true,
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
          <DialogTitle>Aggiungi un conto</DialogTitle>
          <DialogDescription>
            Il saldo di riferimento deve precedere l'inizio del piano. I
            movimenti successivi aggiorneranno la posizione.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel>Società</FieldLabel>
              <Choice
                label="Società del conto"
                value={chosenEntity}
                onChange={setEntityId}
                options={data.entities.map((e) => ({
                  value: e.id,
                  label: e.name,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-name">Nome conto</FieldLabel>
              <Input id="account-name" name="name" required maxLength={100} />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-bank">Banca</FieldLabel>
              <Input id="account-bank" name="bank" required maxLength={100} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="account-balance">
                  Saldo di riferimento (€)
                </FieldLabel>
                <Input
                  id="account-balance"
                  name="balance"
                  inputMode="decimal"
                  defaultValue="0"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-date">Alla data</FieldLabel>
                <Input
                  id="account-date"
                  name="asOfDate"
                  type="date"
                  defaultValue={new Date(
                    new Date(
                      data.asOfDate.slice(0, 7) + "-01T12:00:00Z",
                    ).getTime() - 86400000,
                  )
                    .toISOString()
                    .slice(0, 10)}
                  required
                />
              </Field>
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
              Aggiungi conto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EntityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const write = useWrite("Società creata");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crea la tua società</DialogTitle>
          <DialogDescription>
            La società mantiene separati conti, operazioni e impegni. Questa
            versione utilizza l'euro.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            write.mutate(
              {
                path: "/entities",
                body: { name: form.get("name"), currency: "EUR" },
              },
              { onSuccess: () => onOpenChange(false) },
            );
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="entity-name">Ragione sociale</FieldLabel>
              <Input
                id="entity-name"
                name="name"
                required
                maxLength={200}
                placeholder="La tua azienda S.r.l."
              />
            </Field>
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
              {write.isPending ? "Creazione..." : "Crea società"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
