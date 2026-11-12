import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  formatMoney,
  parseMoney,
  parseItalianMoney,
  remainingMinor,
} from "@opentesoro/engine";
import type { Bootstrap, Forecast, Obligation } from "@opentesoro/sdk";
export type {
  Entity,
  Account,
  Category,
  Transaction,
  Obligation,
  Scenario,
  Booking,
  Bootstrap,
  Forecast,
} from "@opentesoro/sdk";
export type { ForecastPeriod } from "@opentesoro/engine";
export interface Dashboard {
  asOfDate: string;
  currency: string;
  balanceMinor: number;
  receivables: { totalMinor: number; overdueMinor: number; buckets: unknown };
  payables: { totalMinor: number; overdueMinor: number; buckets: unknown };
  accountCount: number;
  uncategorizedCount: number;
  accounts?: { id: string; currentBalanceMinor: number }[];
}
export function useDashboard(entityId = "all") {
  return useQuery({
    queryKey: ["dashboard", entityId],
    queryFn: () =>
      api<Dashboard>(
        `/dashboard${entityId !== "all" ? `?entityId=${encodeURIComponent(entityId)}` : ""}`,
      ),
    staleTime: 30_000,
  });
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem("opentesoro-token");
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.detail ||
        error.message ||
        error.error ||
        `Richiesta non riuscita (${response.status})`,
      response.status,
    );
  }
  return response.json();
}
export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => api<Bootstrap>("/bootstrap"),
    staleTime: 30_000,
  });
}
export function useForecast(
  options: {
    from: string;
    to: string;
    scenarioId?: string;
    entityId?: string;
    granularity?: string;
  },
  enabled = true,
) {
  const params = new URLSearchParams(
    Object.entries(options).filter(
      ([, v]) => v !== undefined && v !== "all",
    ) as [string, string][],
  );
  return useQuery({
    queryKey: ["forecast", options],
    enabled,
    queryFn: () => api<Forecast>(`/forecast?${params}`),
    staleTime: 30_000,
  });
}
export function useWrite<T = unknown>(successMessage = "Modifica salvata") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      api<T>(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["bootstrap"] });
      client.invalidateQueries({ queryKey: ["forecast"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      client.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(successMessage);
    },
    onError: (error) => toast.error(error.message),
  });
}
export const money = (amountMinor: number, currency = "EUR") =>
  formatMoney(amountMinor, currency, "it-IT");
export const compactMoney = (amountMinor: number) =>
  new Intl.NumberFormat("it-IT", {
    notation: "compact",
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" },
) =>
  new Intl.DateTimeFormat("it-IT", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
export const remaining = (obligation: Obligation) =>
  Math.abs(remainingMinor(obligation));
export const isOpen = (obligation: Obligation) =>
  obligation.status !== "settled" &&
  obligation.status !== "cancelled" &&
  remaining(obligation) > 0;
export function parseEuroInput(value: string): number {
  try {
    return value.includes(",") ? parseItalianMoney(value) : parseMoney(value);
  } catch {
    throw new Error("Inserisci un importo valido con massimo due decimali.");
  }
}
export function defaultForecastRange(
  accounts: AccountLike[],
  asOfDate: string,
) {
  const monthStart = asOfDate.slice(0, 7) + "-01";
  const latest = accounts
    .filter((a) => a.enabled)
    .reduce((max, a) => (a.asOfDate > max ? a.asOfDate : max), "0001-01-01");
  const next = new Date(`${latest}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = Number.isNaN(next.getTime())
    ? monthStart
    : next.toISOString().slice(0, 10);
  const from = nextDate > monthStart ? nextDate : monthStart;
  const year = Number(asOfDate.slice(0, 4)),
    month = Number(asOfDate.slice(5, 7));
  const end = new Date(Date.UTC(year, month + 5, 0));
  return { from, to: end.toISOString().slice(0, 10) };
}
type AccountLike = { asOfDate: string; enabled: boolean };
export async function downloadExport(format: "csv" | "json") {
  const token = sessionStorage.getItem("opentesoro-token");
  const res = await fetch(`/api/v1/export?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    toast.error("Esportazione non riuscita. Verifica il token di accesso.");
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `opentesoro-${format === "csv" ? "movimenti" : "workspace"}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
