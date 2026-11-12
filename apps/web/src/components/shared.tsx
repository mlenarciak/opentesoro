import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { money } from "@/lib/api";

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="flex flex-col gap-6" aria-label="Caricamento in corso">
      <Skeleton className="h-12 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Non è stato possibile caricare i dati</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{error.message}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCw data-icon="inline-start" />
          Riprova
        </Button>
      </AlertDescription>
    </Alert>
  );
}
export function EmptyState({
  title = "Nessun risultato",
  description = "Prova a modificare i filtri oppure aggiungi un nuovo elemento.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Wallet />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function Choice({
  value,
  onChange,
  options,
  label,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        className={cn("min-w-36 bg-card", className)}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Cerca...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
      <Input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-card pl-9"
      />
    </div>
  );
}
export function Amount({
  value,
  className,
  signed = false,
}: {
  value: number;
  className?: string;
  signed?: boolean;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums font-medium",
        signed && (value >= 0 ? "text-positive" : "text-foreground"),
        className,
      )}
    >
      {signed && value > 0 ? "+" : ""}
      {money(value)}
    </span>
  );
}
export function Metric({
  title,
  value,
  description,
  icon,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
  trend?: "positive" | "negative";
}) {
  return (
    <Card className="gap-3 py-5 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between px-5">
        <CardDescription>{title}</CardDescription>
        <span className="text-muted-foreground [&>svg]:size-4">{icon}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-5">
        <div className="text-[27px] font-semibold leading-none tracking-tight tabular-nums">
          {value}
        </div>
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground",
            trend === "positive" && "text-positive",
            trend === "negative" && "text-negative",
          )}
        >
          {trend === "positive" ? (
            <ArrowUpRight className="size-3.5" />
          ) : trend === "negative" ? (
            <ArrowDownLeft className="size-3.5" />
          ) : null}
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-5 shadow-none", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
