import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
  LabelList,
} from "recharts";
import type {
  CategorySpending,
  ForecastPoint,
  MonthlySpending,
} from "../utils/finance";

const CHART_PALETTE = [
  "#38BDF8",
  "#22C55E",
  "#F59E0B",
  "#A78BFA",
  "#FB7185",
  "#2DD4BF",
  "#818CF8",
  "#FBBF24",
  "#60A5FA",
];

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "#0F172A",
  border: "1px solid #334155",
  borderRadius: "8px",
  color: "#F8FAFC",
  fontSize: "12px",
  fontFamily: "JetBrains Mono, monospace",
};

function formatAxisINR(val: number): string {
  if (Math.abs(val) >= 1000) {
    return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  }
  return `₹${val}`;
}

function formatTooltipINR(val: number): string {
  return `₹${val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const CumulativeCashFlowChart: React.FC<{
  data: Array<{ dateStr: string; cumulativeCashFlow: number }>;
}> = ({ data }) => (
  <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5">
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100">
          Cumulative Cash Flow Over Time
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">
          Running net cash flow progression across recorded transaction dates
        </p>
      </div>
    </div>
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 6, bottom: 8 }}>
          <defs>
            <linearGradient id="cashflowFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="dateStr"
            stroke="#94A3B8"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
          />
          <YAxis
            stroke="#94A3B8"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatAxisINR}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(val: number) => [formatTooltipINR(val), "Cumulative Cash Flow"]}
          />
          <Area
            type="monotone"
            dataKey="cumulativeCashFlow"
            stroke="#38BDF8"
            strokeWidth={2.25}
            fill="url(#cashflowFill)"
            dot={{ r: 3.5, fill: "#38BDF8", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export const ForecastChart: React.FC<{
  data: ForecastPoint[];
  purchaseAdjustment?: number;
}> = ({ data, purchaseAdjustment = 0 }) => {
  const chartData =
    purchaseAdjustment > 0
      ? data.map((d) => ({
          dateStr: d.dateStr,
          predictedBalance: d.predictedBalance,
          afterPurchase: d.predictedBalance - purchaseAdjustment,
        }))
      : data;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            Predicted Bank Balance — Next 30 Days
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Combines daily average variable spend with detected monthly recurring transactions
          </p>
        </div>
        <span className="text-xs text-amber-400 tabular-nums">
          Safety Threshold: ₹5,000.00
        </span>
      </div>
      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 14, right: 16, left: 6, bottom: 8 }}>
            <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dateStr"
              stroke="#94A3B8"
              tick={{ fontSize: 11 }}
              minTickGap={26}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
            />
            <YAxis
              stroke="#94A3B8"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatAxisINR}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(val: number, name: string) => [
                formatTooltipINR(val),
                name === "afterPurchase" ? "After Planned Purchase" : "Predicted Balance",
              ]}
            />
            <ReferenceLine
              y={5000}
              stroke="#D97706"
              strokeDasharray="6 4"
              label={{
                value: "Safety Balance ₹5,000",
                position: "insideTopRight",
                fill: "#FBBF24",
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="predictedBalance"
              stroke="#22C55E"
              strokeWidth={2.25}
              dot={{ r: 2.5, fill: "#22C55E", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            {purchaseAdjustment > 0 && (
              <Line
                type="monotone"
                dataKey="afterPurchase"
                stroke="#FB7185"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const AnomalyComparisonChart: React.FC<{
  counts: {
    bothDetected: number;
    personalizedOnly: number;
    mlOnly: number;
    normalBoth: number;
    insufficient: number;
  };
}> = ({ counts }) => {
  const data = [
    { name: "Detected by Both", value: counts.bothDetected, color: "#EF4444" },
    { name: "Personalized Only", value: counts.personalizedOnly, color: "#F59E0B" },
    { name: "ML Only", value: counts.mlOnly, color: "#A78BFA" },
    { name: "Normal in Both", value: counts.normalBoth, color: "#22C55E" },
    { name: "Insufficient History", value: counts.insufficient, color: "#38BDF8" },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-100">
          Anomaly Detection Comparison
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">
          Cross-comparison of Isolation Forest predictions and personalized 2.5× median baselines
        </p>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#94A3B8"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
            />
            <YAxis
              stroke="#94A3B8"
              tick={{ fontSize: 11 }}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
              <LabelList dataKey="value" position="top" fill="#E2E8F0" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const SpendingPieChart: React.FC<{
  data: CategorySpending[];
}> = ({ data }) => (
  <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5">
    <div className="mb-4">
      <h3 className="text-base font-semibold text-slate-100">
        Where Is Your Money Going?
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">
        Distribution of total expenses across automatically classified categories
      </p>
    </div>
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="spending"
            nameKey="category"
            cx="50%"
            cy="48%"
            innerRadius={68}
            outerRadius={112}
            paddingAngle={2}
            stroke="#0F172A"
            strokeWidth={2}
          >
            {data.map((_, idx) => (
              <Cell
                key={idx}
                fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(val: number) => [formatTooltipINR(val), "Spending"]}
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: "#CBD5E1" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export const MonthlyTrendsChart: React.FC<{
  data: MonthlySpending[];
}> = ({ data }) => (
  <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5">
    <div className="mb-4">
      <h3 className="text-base font-semibold text-slate-100">
        Monthly Expense Comparison
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">
        Total outgoing expenditure aggregated by calendar month
      </p>
    </div>
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 16, left: 6, bottom: 8 }}>
          <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            stroke="#94A3B8"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
          />
          <YAxis
            stroke="#94A3B8"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatAxisINR}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(val: number) => [formatTooltipINR(val), "Total Spending (₹)"]}
          />
          <Bar dataKey="spending" fill="#38BDF8" radius={[6, 6, 0, 0]} maxBarSize={64}>
            <LabelList
              dataKey="spending"
              position="top"
              fill="#E2E8F0"
              fontSize={11}
              formatter={(v: unknown) => {
                const n = Number(v);
                return n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`;
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);
