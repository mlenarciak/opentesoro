import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactMoney, dateLabel, money, type ForecastPeriod } from "@/lib/api";
export function CashChart({
  periods,
  asOfDate,
  height = 300,
}: {
  periods: ForecastPeriod[];
  asOfDate: string;
  height?: number;
}) {
  const data = periods.map((p) => ({
    date: p.date,
    balance: p.closingBalanceMinor,
    actual: p.date <= asOfDate ? p.closingBalanceMinor : null,
    forecast: p.date >= asOfDate ? p.closingBalanceMinor : null,
  }));
  return (
    <div
      style={{ height }}
      className="w-full"
      role="img"
      aria-label="Andamento della liquidità: saldo consuntivo e previsto in euro"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={data}
          margin={{ top: 15, right: 15, left: 5, bottom: 0 }}
        >
          <defs>
            <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(d) =>
              dateLabel(d, { day: "numeric", month: "short" })
            }
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            minTickGap={45}
            dy={10}
          />
          <YAxis
            tickFormatter={(v) => compactMoney(v)}
            tickLine={false}
            axisLine={false}
            width={75}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            formatter={(v: unknown) => [money(Number(v)), "Liquidità"]}
            labelFormatter={(label) =>
              dateLabel(String(label), {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            }
            labelStyle={{ color: "var(--popover-foreground)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
            contentStyle={{
              borderRadius: 0,
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--chart-1)"
            strokeWidth={2.3}
            fill="url(#cashFill)"
            activeDot={{ r: 4, strokeWidth: 3, stroke: "var(--card)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
