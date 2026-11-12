import { useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  ChevronRight,
  Code2,
  Landmark,
  LayoutDashboard,
  Menu,
  Plane,
  Plug,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { Choice } from "./shared";
import { useBootstrap, dateLabel } from "@/lib/api";
import { ScopeProvider, useScope } from "@/lib/context";
import { cn } from "@/lib/utils";
const navigation = [
  { to: "/", label: "Panoramica", icon: LayoutDashboard },
  { to: "/movimenti", label: "Movimenti", icon: ArrowDownUp },
  { to: "/previsioni", label: "Piano di tesoreria", icon: ChartNoAxesCombined },
  { to: "/scadenze", label: "Scadenziario", icon: CalendarClock },
  { to: "/prenotazioni", label: "Viaggi e prenotazioni", icon: Plane },
  { to: "/conti", label: "Conti e società", icon: Landmark },
  { to: "/integrazioni", label: "Importa e integra", icon: Plug },
] as const;
export function Layout() {
  return (
    <ScopeProvider>
      <AppShell />
    </ScopeProvider>
  );
}
function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data } = useBootstrap();
  const { entityId, setEntityId } = useScope();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const current = navigation.find((n) => n.to === path);
  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-card transition-transform lg:translate-x-0",
          !mobileOpen && "-translate-x-full",
        )}
      >
        <div className="flex h-[76px] items-center justify-between gap-3 px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5"
            onClick={() => setMobileOpen(false)}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="size-[18px]" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              opentesoro<span className="text-positive">.</span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Chiudi menu"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </Button>
        </div>
        <div className="px-4 pb-5">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
              TV
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                {data?.entities.find((e) => e.id === entityId)?.name ??
                  data?.entities[0]?.name ??
                  "Il tuo workspace"}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {data?.demo ? "Workspace dimostrativo" : "Workspace locale"}
              </div>
            </div>
            <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          </div>
        </div>
        <nav
          className="flex flex-col gap-1 px-3"
          aria-label="Navigazione principale"
        >
          <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            La tua tesoreria
          </p>
          {navigation.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-accent",
                path === to
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-[17px]" />
              {label}
              {to === "/scadenze" && data && (
                <span className="ml-auto text-[11px] tabular-nums">
                  {data.obligations.filter(
                    (o) => o.status === "open" && o.dueDate < data.asOfDate,
                  ).length || ""}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <div className="mb-4 flex flex-col gap-2 rounded-lg bg-muted/70 p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Code2 className="size-3.5" />
              Aperto, anche nel codice.
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              I tuoi dati. La tua infrastruttura.
              <br />
              Nessun vincolo, nessuna scatola nera.
            </p>
            <a
              href="/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center gap-1 text-[11px] font-medium"
            >
              Esplora le API
              <ArrowUpRight className="size-3" />
            </a>
          </div>
          <Separator />
          <div className="flex items-center gap-2.5 pt-4">
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              DV
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium">Direzione finanziaria</span>
              <span className="text-[10px] text-muted-foreground">
                Ambiente locale · v{data?.version ?? "0.1.0"}
              </span>
            </div>
            <ShieldCheck className="ml-auto size-4 text-positive" />
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          aria-label="Chiudi menu"
          className="fixed inset-0 z-20 bg-foreground/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between gap-3 border-b bg-card/95 px-5 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-2 text-xs">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Apri menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <span className="hidden text-muted-foreground sm:inline">
              Workspace
            </span>
            <ChevronRight className="hidden size-3.5 text-muted-foreground sm:block" />
            <span className="font-medium">
              {current?.label ?? "OpenTesoro"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-positive" />
              {data?.demo ? "Dati di esempio" : "Workspace locale"}
            </Badge>
            <Choice
              label="Seleziona società"
              value={entityId}
              onChange={setEntityId}
              options={[
                { value: "all", label: "Tutte le società" },
                ...(data?.entities ?? []).map((e) => ({
                  value: e.id,
                  label: e.name,
                })),
              ]}
            />
            <Button
              variant="ghost"
              size="icon"
              title="Aggiorna dati"
              aria-label="Aggiorna dati"
              onClick={() => queryClient.invalidateQueries()}
            >
              <RefreshCw />
            </Button>
          </div>
        </header>
        <main className="mx-auto flex max-w-[1600px] flex-col gap-7 px-5 py-7 sm:px-8 sm:py-8">
          <Outlet />
        </main>
        <footer className="mx-5 flex flex-wrap items-center justify-between gap-2 border-t py-5 text-[11px] text-muted-foreground sm:mx-8">
          <span>OpenTesoro · La tesoreria, con chiarezza.</span>
          <span>
            Valuta EUR ·{" "}
            {data
              ? `Data di riferimento: ${dateLabel(data.asOfDate, { day: "numeric", month: "long", year: "numeric" })}`
              : "Caricamento dati..."}
          </span>
        </footer>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
