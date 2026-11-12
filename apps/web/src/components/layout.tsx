import { useEffect, useState } from "react";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ThemeToggle } from "./theme-toggle";
import { PublicDemoBanner } from "@/components/public-demo-banner";
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

function SidebarContents({
  onNavigate,
  mobile = false,
}: {
  onNavigate: () => void;
  mobile?: boolean;
}) {
  const { data } = useBootstrap();
  const { entityId } = useScope();
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar text-sidebar-foreground">
      <div className="flex min-h-[76px] items-center justify-between gap-3 px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5"
          onClick={onNavigate}
          aria-label="OpenTesoro, panoramica"
        >
          <span className="flex size-8 items-center justify-center bg-primary text-primary-foreground">
            <Wallet className="size-[18px]" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            opentesoro<span className="text-text-accent">.</span>
          </span>
        </Link>
        {mobile && (
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Chiudi menu">
              <X data-icon="inline-start" />
            </Button>
          </DialogClose>
        )}
      </div>
      <div className="px-4 pb-5">
        <div className="flex items-center gap-3 border border-sidebar-border bg-background p-3">
          <span className="flex size-8 shrink-0 items-center justify-center bg-muted text-xs font-semibold">
            TV
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">
              {data?.entities.find((entity) => entity.id === entityId)?.name ??
                data?.entities[0]?.name ??
                "Il tuo workspace"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {data?.demo ? "Workspace dimostrativo" : "Workspace di tesoreria"}
            </div>
          </div>
          <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </div>
      </div>
      <nav
        className="flex flex-col gap-1 px-3"
        aria-label="Navigazione principale"
      >
        <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          La tua tesoreria
        </p>
        {navigation.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            aria-current={path === to ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              path === to
                ? "border-sidebar-primary bg-sidebar-accent text-sidebar-primary"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-[17px]" />
            {label}
            {to === "/scadenze" && data && (
              <span className="ml-auto text-[11px] tabular-nums">
                {data.obligations.filter(
                  (obligation) =>
                    obligation.status === "open" &&
                    obligation.dueDate < data.asOfDate,
                ).length || ""}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <div className="mb-4 flex flex-col gap-2 border border-sidebar-border bg-muted/50 p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Code2 className="size-3.5 text-text-accent" />
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
          <span className="flex size-8 items-center justify-center bg-secondary text-xs font-medium">
            DV
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">Direzione finanziaria</span>
            <span className="text-[11px] text-muted-foreground">
              {data?.demo ? "Dati dimostrativi" : "Workspace di tesoreria"} · v
              {data?.version ?? "0.1.0"}
            </span>
          </div>
          <ShieldCheck className="ml-auto size-4 text-text-accent" />
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data } = useBootstrap();
  const { entityId, setEntityId } = useScope();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const current = navigation.find((item) => item.to === path);
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);
  useEffect(() => {
    const media = matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) setMobileOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  return (
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="min-h-screen">
        <a className="skip-link" href="#main-content">
          Vai al contenuto
        </a>
        <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border lg:flex">
          <SidebarContents onNavigate={() => setMobileOpen(false)} />
        </aside>
        <DialogContent className="mobile-navigation" showCloseButton={false}>
          <DialogTitle className="sr-only">Menu di navigazione</DialogTitle>
          <DialogDescription className="sr-only">
            Scegli una sezione della tua tesoreria. Premi Esc per chiudere il
            menu.
          </DialogDescription>
          <SidebarContents mobile onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
        <div className="lg:pl-60">
          <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-card/95 px-5 py-3 backdrop-blur-sm sm:h-[68px] sm:flex-nowrap sm:px-8 sm:py-0">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Apri menu"
                >
                  <Menu data-icon="inline-start" />
                </Button>
              </DialogTrigger>
              <span className="hidden text-muted-foreground md:inline">
                Workspace
              </span>
              <ChevronRight className="hidden size-3.5 text-muted-foreground md:block" />
              <span className="truncate font-medium">
                {current?.label ?? "OpenTesoro"}
              </span>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
              <Badge
                variant="outline"
                className="hidden gap-1.5 xl:inline-flex"
              >
                <span className="size-1.5 bg-sidebar-primary" />
                {data?.demo ? "Dati di esempio" : "Workspace di tesoreria"}
              </Badge>
              <Choice
                label="Seleziona società"
                value={entityId}
                onChange={setEntityId}
                className="min-w-0 flex-1 sm:min-w-36 sm:flex-none"
                options={[
                  { value: "all", label: "Tutte le società" },
                  ...(data?.entities ?? []).map((entity) => ({
                    value: entity.id,
                    label: entity.name,
                  })),
                ]}
              />
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                title="Aggiorna dati"
                aria-label="Aggiorna dati"
                onClick={() => queryClient.invalidateQueries()}
              >
                <RefreshCw data-icon="inline-start" />
              </Button>
            </div>
          </header>
          <PublicDemoBanner />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto flex max-w-[1600px] flex-col gap-7 px-5 py-7 outline-none sm:px-8 sm:py-8"
          >
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
    </Dialog>
  );
}
