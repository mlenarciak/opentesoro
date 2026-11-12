import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { publicDemoClient } from "@/lib/public-demo";

export function PublicDemoBanner() {
  const demo = useSyncExternalStore(publicDemoClient.subscribe, publicDemoClient.getSnapshot);
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (demo.mode !== "public" || demo.status !== "ready" || !demo.expiresAt) return;
    const timeout = setTimeout(() => publicDemoClient.expire(), Math.max(0, Date.parse(demo.expiresAt) - Date.now()));
    return () => clearTimeout(timeout);
  }, [demo]);
  if (demo.mode === "private") return null;
  async function restart() {
    setBusy(true);
    try {
      await queries.cancelQueries();
      if (demo.status === "changed") { window.location.reload(); return; }
      if (demo.mode === "public" && demo.status !== "unavailable") {
        await publicDemoClient.reset();
        // Reset also clears selected entities, open forms and tab-local query
        // results, which may refer to records removed with the old session.
        window.location.assign("/");
        return;
      } else await publicDemoClient.initialize();
      await queries.invalidateQueries();
      if (publicDemoClient.getSnapshot().status === "ready") toast.success("Workspace disponibile.");
      else toast.error("Servizio temporaneamente non disponibile. Riprova tra poco.");
    } catch { toast.error("Impossibile ripristinare la demo. Riprova tra poco."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-[1600px] px-5 pt-5 sm:px-8">
    <Alert role={demo.status === "ready" ? "status" : "alert"}>
      <FlaskConical />
      <AlertTitle>{demo.status === "changed" ? "La demo è cambiata in un’altra scheda" : demo.status === "expired" ? "La sessione demo è terminata" : demo.status === "unavailable" ? "Connessione al workspace non disponibile" : "Demo pubblica · Il tuo spazio di prova"}</AlertTitle>
      <AlertDescription>
        <p>{demo.status === "ready" ? "Usa solo dati inventati. Le modifiche sono isolate dagli altri visitatori e temporanee: 30 minuti di inattività, al massimo 2 ore. Le schede dello stesso browser condividono la demo. Nessun collegamento a conti reali." : demo.status === "changed" ? "Un’altra scheda ha ripristinato il workspace. Ricarica questa pagina per vedere i dati aggiornati; nessuna operazione viene ripetuta automaticamente." : demo.status === "expired" ? "Le modifiche precedenti non sono più disponibili. Avvia una nuova demo per ripartire dai dati di esempio." : "I dati non vengono sostituiti con esempi in caso di errore. Riprova la connessione."}</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void restart()}>
          <RotateCcw data-icon="inline-start" />
          {busy ? "Attendi…" : demo.status === "changed" ? "Ricarica workspace" : demo.status === "expired" ? "Avvia nuova demo" : demo.status === "unavailable" ? "Riprova connessione" : "Ripristina demo"}
        </Button>
      </AlertDescription>
    </Alert>
  </div>;
}
