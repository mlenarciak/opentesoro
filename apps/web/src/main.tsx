import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Layout } from "./components/layout";
import { LoadingState, EmptyState } from "./components/shared";
import "./styles.css";
import { publicDemoClient } from "./lib/public-demo";
const Overview = lazy(() => import("./pages/overview"));
const Transactions = lazy(() => import("./pages/transactions"));
const Forecast = lazy(() => import("./pages/forecast"));
const Obligations = lazy(() => import("./pages/obligations"));
const Bookings = lazy(() => import("./pages/bookings"));
const Accounts = lazy(() => import("./pages/accounts"));
const Integrations = lazy(() => import("./pages/integrations"));
const rootRoute = createRootRoute({
  component: Layout,
  notFoundComponent: () => (
    <EmptyState
      title="Pagina non trovata"
      description="Seleziona una voce dal menu per tornare alla tua tesoreria."
    />
  ),
});
const pages = [
  ["/", Overview],
  ["/movimenti", Transactions],
  ["/previsioni", Forecast],
  ["/scadenze", Obligations],
  ["/prenotazioni", Bookings],
  ["/conti", Accounts],
  ["/integrazioni", Integrations],
] as const;
const routeTree = rootRoute.addChildren(
  pages.map(([path, Component]) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <Suspense fallback={<LoadingState />}>
          <Component />
        </Suspense>
      ),
    }),
  ),
);
const router = createRouter({ routeTree, defaultPreload: "intent" });
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
// Establish one demo session before parallel React Query requests start.
await publicDemoClient.initialize();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" storageKey="opentesoro.theme" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
