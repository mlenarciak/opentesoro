import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  Check,
  Code2,
  Download,
  FileSpreadsheet,
  KeyRound,
  Landmark,
  Plug,
  Upload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  ErrorState,
  LoadingState,
  PageHeading,
  SectionCard,
} from "@/components/shared";
import { api, downloadExport, useBootstrap, useWrite } from "@/lib/api";
interface Preview {
  rows: {
    row: number;
    date: string;
    description: string;
    counterparty: string;
    amountMinor: number;
    externalId: string;
  }[];
  errors: { row: number; message: string }[];
  totalRows: number;
  delimiter: string;
}
interface Rule {
  id: string;
  name: string;
  categoryId: string;
  priority: number;
  contains: string;
  direction: string;
  enabled: boolean;
}
const sample =
  "date;description;counterparty;amount;externalId\n2026-11-12;Acconto viaggio Sicilia;Cliente dimostrativo;1250,00;demo-import-001\n2026-11-12;Saldo allotment hotel;Hotel dimostrativo;-850,50;demo-import-002";
export default function Integrations() {
  const bootstrap = useBootstrap();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accountId, setAccountId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
  } | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [token, setToken] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const write = useWrite<{ imported: number; duplicates: number }>(
    "Importazione completata",
  );
  const applyRules = useWrite<{ updated: number }>("Regole applicate");
  const rules = useQuery({
    queryKey: ["rules"],
    queryFn: () => api<{ items: Rule[] }>("/rules"),
    retry: false,
  });
  const readPreview = async () => {
    setError("");
    setPreview(null);
    setResult(null);
    setPreviewLoading(true);
    try {
      setPreview(
        await api<Preview>("/import/preview", {
          method: "POST",
          body: JSON.stringify({ csv }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };
  const updateCsv = (value: string) => {
    setCsv(value);
    setPreview(null);
    setResult(null);
    setError("");
  };
  if (bootstrap.isPending) return <LoadingState />;
  if (bootstrap.error)
    return (
      <>
        <ErrorState error={bootstrap.error} retry={() => bootstrap.refetch()} />
        <TokenForm
          token={token}
          setToken={setToken}
          onSave={() => {
            sessionStorage.setItem("opentesoro-token", token);
            client.invalidateQueries();
            toast.success("Token impostato per questa sessione");
          }}
        />
      </>
    );
  const data = bootstrap.data;
  const chosenAccount = accountId || data.accounts[0]?.id || "";
  return (
    <>
      <PageHeading
        eyebrow="Aperto al tuo ecosistema"
        title="Importa e integra"
        description="Parti da un estratto conto. Collega i tuoi sistemi attraverso un'API documentata e indipendente."
        actions={
          <Button variant="outline" asChild>
            <a href="/openapi.json" target="_blank" rel="noreferrer">
              <Code2 data-icon="inline-start" />
              Riferimento API
            </a>
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard
          title="Importa movimenti da CSV"
          description="Anteprima, validazione e deduplicazione prima di scrivere sui conti."
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
              >
                <Upload data-icon="inline-start" />
                Scegli un file CSV
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label="File CSV da importare"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) updateCsv(await file.text());
                }}
              />
              <Button variant="ghost" onClick={() => updateCsv(sample)}>
                Usa un esempio
              </Button>
            </div>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="import-csv">Contenuto CSV</FieldLabel>
                <Textarea
                  id="import-csv"
                  value={csv}
                  onChange={(e) => updateCsv(e.target.value)}
                  className="min-h-44 font-mono text-xs"
                  placeholder={
                    "date;description;counterparty;amount;externalId\n2026-11-12;Acconto viaggio;Cliente;1250,00;rif-001"
                  }
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Separatore virgola o punto e virgola. Data ISO, importo in
                  euro con segno. Una riga per movimento.
                </p>
              </Field>
              <Field>
                <FieldLabel>Conto di destinazione</FieldLabel>
                <Choice
                  label="Conto importazione"
                  value={chosenAccount}
                  onChange={setAccountId}
                  options={data.accounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} · ${a.bank}`,
                  }))}
                />
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={readPreview}
                disabled={!csv.trim() || previewLoading}
              >
                {previewLoading
                  ? "Analisi in corso..."
                  : "Verifica e mostra anteprima"}
                <ArrowRight data-icon="inline-end" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Nessun dato viene scritto in questa fase.
              </span>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Importazione non valida</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {preview && (
              <div className="flex flex-col gap-4 border-t pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {preview.totalRows} righe rilevate
                  </h3>
                  <Badge
                    variant={
                      preview.errors.length ? "destructive" : "secondary"
                    }
                  >
                    {preview.errors.length
                      ? `${preview.errors.length} errori`
                      : "Validazione completata"}
                  </Badge>
                </div>
                {preview.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>Correggi il file prima di importare</AlertTitle>
                    <AlertDescription>
                      <ul className="list-inside list-disc">
                        {preview.errors.slice(0, 8).map((e, i) => (
                          <li key={i}>
                            Riga {e.row}: {e.message}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrizione</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.slice(0, 10).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row.date}</TableCell>
                        <TableCell>
                          <p className="text-xs font-medium">
                            {row.counterparty}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.description}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount
                            value={row.amountMinor}
                            signed
                            className="text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.rows.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    Anteprima delle prime 10 righe. Verranno elaborate tutte le
                    righe valide.
                  </p>
                )}
                <Button
                  disabled={
                    Boolean(preview.errors.length) ||
                    !chosenAccount ||
                    write.isPending ||
                    Boolean(result)
                  }
                  onClick={() =>
                    write.mutate(
                      {
                        path: "/import/commit",
                        body: { csv, accountId: chosenAccount },
                      },
                      { onSuccess: (res) => setResult(res) },
                    )
                  }
                >
                  <Check data-icon="inline-start" />
                  {write.isPending
                    ? "Importazione..."
                    : "Conferma importazione"}
                </Button>
              </div>
            )}
            {result && (
              <Alert>
                <Check />
                <AlertTitle>Operazione completata</AlertTitle>
                <AlertDescription>
                  {result.imported} movimenti importati · {result.duplicates}{" "}
                  duplicati ignorati.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </SectionCard>
        <div className="flex flex-col gap-5">
          <SectionCard
            title="I tuoi dati, sempre tuoi"
            description="Esporta senza formati proprietari."
          >
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={() => downloadExport("csv")}>
                <FileSpreadsheet data-icon="inline-start" />
                Scarica movimenti CSV
              </Button>
              <Button variant="outline" onClick={() => downloadExport("json")}>
                <Download data-icon="inline-start" />
                Esporta workspace JSON
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Gli export includono i dati salvati in questo workspace.
                Conservali come dati finanziari.
              </p>
            </div>
          </SectionCard>
          <SectionCard
            title="Integrazioni esterne"
            description="Confini chiari, nessuna connessione implicita."
          >
            <div className="flex flex-col gap-4">
              {[
                {
                  icon: Landmark,
                  name: "Open banking / PSD2",
                  desc: "Richiede un provider autorizzato e consenso bancario.",
                  status: "Da integrare",
                },
                {
                  icon: Plug,
                  name: "Agicap",
                  desc: "Migrazione CSV disponibile. Sincronizzazione OAuth pubblica in roadmap.",
                  status: "Roadmap",
                },
                {
                  icon: Code2,
                  name: "ERP e gestionale viaggi",
                  desc: "REST API e SDK TypeScript per i tuoi sistemi.",
                  status: "API disponibile",
                },
              ].map((i) => (
                <div key={i.name} className="flex items-start gap-3">
                  <i.icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium">{i.name}</p>
                      <Badge variant="outline" className="text-[9px]">
                        {i.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {i.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
      <SectionCard
        title="Regole di categorizzazione"
        description="La prima regola compatibile, in ordine di priorità, assegna la categoria ai movimenti non classificati."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={applyRules.isPending}
              onClick={() =>
                applyRules.mutate(
                  { path: "/rules/apply", body: {} },
                  {
                    onSuccess: (result) =>
                      toast.info(`${result.updated} movimenti aggiornati`),
                  },
                )
              }
            >
              Applica regole
            </Button>
            <Button size="sm" onClick={() => setRuleOpen(true)}>
              Nuova regola
            </Button>
          </div>
        }
      >
        {rules.data?.items?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regola</TableHead>
                <TableHead>Contiene</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Priorità</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.data.items.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="text-sm">{rule.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {rule.contains}
                  </TableCell>
                  <TableCell className="text-xs">
                    {
                      data.categories.find((c) => c.id === rule.categoryId)
                        ?.name
                    }
                  </TableCell>
                  <TableCell className="text-xs">{rule.priority}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            Crea una regola per riconoscere automaticamente descrizioni e
            controparti ricorrenti.
          </p>
        )}
      </SectionCard>
      <TokenForm
        token={token}
        setToken={setToken}
        onSave={() => {
          if (token) sessionStorage.setItem("opentesoro-token", token);
          else sessionStorage.removeItem("opentesoro-token");
          client.invalidateQueries();
          toast.success("Credenziali di sessione aggiornate");
        }}
      />
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova regola</DialogTitle>
            <DialogDescription>
              Una condizione semplice e verificabile per classificare i
              movimenti.
            </DialogDescription>
          </DialogHeader>
          <RuleForm
            categories={data.categories}
            onComplete={() => {
              setRuleOpen(false);
              client.invalidateQueries({ queryKey: ["rules"] });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
function TokenForm({
  token,
  setToken,
  onSave,
}: {
  token: string;
  setToken: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <SectionCard
      title="Accesso API del workspace"
      description="Solo se il server è configurato con un token. Conservato nella sessione del browser, mai negli export."
    >
      <form
        className="flex max-w-xl flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
          setToken("");
        }}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor="api-token">Token di accesso</FieldLabel>
          <Input
            id="api-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder="Token del server OpenTesoro"
          />
        </Field>
        <Button type="submit" variant="outline">
          <KeyRound data-icon="inline-start" />
          Salva nella sessione
        </Button>
      </form>
    </SectionCard>
  );
}
function RuleForm({
  categories,
  onComplete,
}: {
  categories: { id: string; name: string }[];
  onComplete: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [direction, setDirection] = useState("both");
  const write = useWrite("Regola creata");
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        write.mutate(
          {
            path: "/rules",
            body: {
              name: form.get("name"),
              contains: form.get("contains"),
              priority: Number(form.get("priority")),
              categoryId,
              direction,
              enabled: true,
            },
          },
          { onSuccess: onComplete },
        );
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="rule-name">Nome regola</FieldLabel>
          <Input id="rule-name" name="name" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="rule-contains">
            Descrizione o controparte contiene
          </FieldLabel>
          <Input id="rule-contains" name="contains" required />
        </Field>
        <Field>
          <FieldLabel>Categoria</FieldLabel>
          <Choice
            label="Categoria della regola"
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field>
          <FieldLabel>Flusso</FieldLabel>
          <Choice
            label="Flusso della regola"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "both", label: "Entrate e uscite" },
              { value: "inflow", label: "Solo entrate" },
              { value: "outflow", label: "Solo uscite" },
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="rule-priority">Priorità</FieldLabel>
          <Input
            id="rule-priority"
            name="priority"
            type="number"
            min="0"
            max="10000"
            defaultValue="100"
            required
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={write.isPending}>
          Crea regola
        </Button>
      </DialogFooter>
    </form>
  );
}
