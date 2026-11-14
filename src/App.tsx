import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HeartPulse,
  Info,
  LayoutDashboard,
  ListFilter,
  Menu,
  RotateCcw,
  Search,
  ShieldAlert,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  SAMPLE_CSV,
  analyzeFinancialData,
  buildAdvisorInsights,
  formatDDMMYYYY,
  formatINR,
  parseTransactionCSV,
  type RawTransaction,
} from "./utils/finance";
import {
  AnomalyComparisonChart,
  CumulativeCashFlowChart,
  ForecastChart,
  MonthlyTrendsChart,
  SpendingPieChart,
} from "./components/RupeeCharts";

type NavSection =
  | "overview"
  | "transactions"
  | "forecast"
  | "anomalies"
  | "simulator"
  | "health";

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ListFilter },
  { id: "forecast", label: "30-Day Forecast", icon: TrendingUp },
  { id: "anomalies", label: "Anomaly Detection", icon: ShieldAlert },
  { id: "simulator", label: "Purchase Simulator", icon: Calculator },
  { id: "health", label: "Health & Advisor", icon: HeartPulse },
];

const StatusCallout: React.FC<{
  type: "info" | "success" | "warning" | "error";
  title?: string;
  children: React.ReactNode;
}> = ({ type, title, children }) => {
  const config: Record<
    typeof type,
    { border: string; bg: string; text: string; icon: React.ReactNode }
  > = {
    info: {
      border: "border-sky-500/30",
      bg: "bg-sky-500/10",
      text: "text-sky-200",
      icon: <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />,
    },
    success: {
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10",
      text: "text-emerald-200",
      icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />,
    },
    warning: {
      border: "border-amber-500/30",
      bg: "bg-amber-500/10",
      text: "text-amber-200",
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />,
    },
    error: {
      border: "border-red-500/30",
      bg: "bg-red-500/10",
      text: "text-red-200",
      icon: <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />,
    },
  };

  const c = config[type];
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border ${c.border} ${c.bg} px-4 py-3 text-sm ${c.text}`}
    >
      {c.icon}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold text-slate-100">{title}</div>}
        <div className={title ? "mt-0.5 text-slate-300" : ""}>{children}</div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  subtext?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}> = ({ label, value, subtext, tone = "default" }) => {
  const valueTone =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : tone === "warning"
          ? "text-amber-400"
          : "text-slate-100";

  return (
    <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div
        className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${valueTone}`}
      >
        {value}
      </div>
      {subtext && (
        <div className="mt-1.5 text-xs text-slate-400 tabular-nums">
          {subtext}
        </div>
      )}
    </div>
  );
};

export function App() {
  const [activeNav, setActiveNav] = useState<NavSection>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const [rawTransactions, setRawTransactions] = useState<RawTransaction[]>(() =>
    parseTransactionCSV(SAMPLE_CSV).transactions
  );
  const [isUploaded, setIsUploaded] = useState(false);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<{
    type: "info" | "success" | "warning" | "error";
    text: string;
  }>({
    type: "info",
    text: "Currently displaying sample transaction data.",
  });
  const [duplicatesNotice, setDuplicatesNotice] = useState<string | null>(null);
  const [columnsFound, setColumnsFound] = useState<string[] | null>(null);

  const [balance, setBalance] = useState<number>(18000);
  const [purchaseAmount, setPurchaseAmount] = useState<number>(14000);
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>("All Categories");
  const [searchText, setSearchText] = useState<string>("");

  useEffect(() => {
    if (isUploaded) return;
    fetch("/transactions.csv")
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        if (!text) return;
        const parsed = parseTransactionCSV(text);
        if (!parsed.error && parsed.transactions.length > 0) {
          setRawTransactions(parsed.transactions);
        }
      })
      .catch(() => {
        // Fallback to embedded SAMPLE_CSV already loaded
      });
  }, [isUploaded]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      const result = parseTransactionCSV(text);

      if (result.error) {
        setUploadNotice({ type: "error", text: result.error });
        setColumnsFound(result.columnsFound ?? null);
        setDuplicatesNotice(null);
        return;
      }

      setColumnsFound(null);
      setDuplicatesNotice(
        result.duplicatesRemoved > 0
          ? `${result.duplicatesRemoved} duplicate transactions removed.`
          : null
      );
      setRawTransactions(result.transactions);
      setIsUploaded(true);
      setUploadFilename(file.name);
      setSelectedCategoryFilter("All Categories");
      setSearchText("");
      setUploadNotice({
        type: "success",
        text: `Successfully uploaded ${result.transactions.length} transactions!`,
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleResetSample = () => {
    const parsed = parseTransactionCSV(SAMPLE_CSV);
    setRawTransactions(parsed.transactions);
    setIsUploaded(false);
    setUploadFilename(null);
    setDuplicatesNotice(null);
    setColumnsFound(null);
    setSelectedCategoryFilter("All Categories");
    setSearchText("");
    setUploadNotice({
      type: "info",
      text: "Currently displaying sample transaction data.",
    });
  };

  const analysis = useMemo(
    () => analyzeFinancialData(rawTransactions, balance),
    [rawTransactions, balance]
  );

  const categoryOptions = useMemo(() => {
    const unique = Array.from(
      new Set(analysis.transactions.map((t) => t.category))
    ).sort();
    return ["All Categories", ...unique];
  }, [analysis.transactions]);

  const filteredTransactions = useMemo(() => {
    return analysis.transactions
      .filter((tx) => {
        if (
          selectedCategoryFilter !== "All Categories" &&
          tx.category !== selectedCategoryFilter
        ) {
          return false;
        }
        if (
          searchText.trim() !== "" &&
          !tx.description
            .toLowerCase()
            .includes(searchText.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.dateMs - a.dateMs);
  }, [analysis.transactions, selectedCategoryFilter, searchText]);

  const remainingBalanceAfterPurchase = balance - purchaseAmount;
  const lowestFutureBalanceAfterPurchase = useMemo(() => {
    if (analysis.forecast.length === 0) return remainingBalanceAfterPurchase;
    return Math.min(
      ...analysis.forecast.map((f) => f.predictedBalance - purchaseAmount)
    );
  }, [analysis.forecast, purchaseAmount, remainingBalanceAfterPurchase]);

  const insights = useMemo(
    () =>
      buildAdvisorInsights(
        analysis,
        purchaseAmount,
        lowestFutureBalanceAfterPurchase
      ),
    [analysis, purchaseAmount, lowestFutureBalanceAfterPurchase]
  );

  const highestCategory = analysis.categorySpending[0];
  const activeNavLabel =
    NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? "Overview";

  const selectSection = (section: NavSection) => {
    setActiveNav(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-[#0F172A] text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-[#0B1120] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
            RupeeSentinel
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Dashboard sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectSection(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-slate-800/90 text-sky-400"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quick Controls in Sidebar */}
        <div className="space-y-4 border-t border-slate-800 p-4">
          <div>
            <label
              htmlFor="sidebar-balance-input"
              className="block text-xs font-medium text-slate-400"
            >
              Current Bank Balance (₹)
            </label>
            <input
              id="sidebar-balance-input"
              type="number"
              min={0}
              step={500}
              value={balance}
              onChange={(e) =>
                setBalance(Math.max(0, Number(e.target.value) || 0))
              }
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 tabular-nums focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="space-y-1 text-xs text-slate-400">
            <div className="font-medium text-slate-300">Dataset Summary</div>
            <div className="tabular-nums">
              {analysis.transactions.length} transactions ·{" "}
              {analysis.historyMonths} mo history
            </div>
            <div className="truncate text-slate-500">
              {uploadFilename ? uploadFilename : "Sample: transactions.csv"}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: Breadcrumb on left, primary actions on right */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-800 bg-[#0F172A]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:bg-slate-800 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm whitespace-nowrap truncate">
              <span className="text-slate-400">RupeeSentinel</span>
              <span className="text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-100">
                {activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {isUploaded && (
              <button
                type="button"
                onClick={handleResetSample}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Sample</span>
              </button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 whitespace-nowrap shrink-0">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </header>

        {/* Active Viewport Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {/* Status Notices */}
          <div className="space-y-2.5">
            {duplicatesNotice && (
              <StatusCallout type="warning">{duplicatesNotice}</StatusCallout>
            )}
            {uploadNotice.type !== "info" && (
              <StatusCallout type={uploadNotice.type}>
                {uploadNotice.text}
                {columnsFound && (
                  <div className="mt-1 font-mono text-xs text-slate-300">
                    Columns found: {JSON.stringify(columnsFound)}
                  </div>
                )}
              </StatusCallout>
            )}
          </div>

          {/* OVERVIEW VIEW */}
          {activeNav === "overview" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                    Personal Financial Operating System
                  </h1>
                  <p className="mt-1 text-sm text-slate-400">
                    {uploadNotice.type === "info"
                      ? "Displaying sample transaction data"
                      : `Loaded ${analysis.transactions.length} transactions from ${uploadFilename ?? "CSV"}`}
                    <span className="mx-2 text-slate-600">·</span>
                    {analysis.personalizedModelCount > 0
                      ? `Personalized ML models active for ${analysis.personalizedModelCount} categories`
                      : "Using synthetic category ML baseline models"}
                  </p>
                </div>
              </div>

              {/* 4-Column KPI Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Current Balance"
                  value={formatINR(balance)}
                  subtext="Editable in sidebar"
                />
                <KpiCard
                  label="Total Income"
                  value={formatINR(analysis.income)}
                  tone="positive"
                  subtext={`Across ${analysis.historyMonths} months`}
                />
                <KpiCard
                  label="Total Expenses"
                  value={formatINR(analysis.expenses)}
                  tone="negative"
                  subtext={`${analysis.expenseTransactions.length} debit entries`}
                />
                <KpiCard
                  label="Net Cash Flow"
                  value={formatINR(analysis.netCashflow)}
                  tone={analysis.netCashflow >= 0 ? "positive" : "negative"}
                  subtext={`Savings rate: ${analysis.savingsRate.toFixed(1)}%`}
                />
              </div>

              {/* Primary Cumulative Chart */}
              <CumulativeCashFlowChart data={analysis.dailyFlow} />

              {/* Spending Breakdown & Monthly Trends Split */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SpendingPieChart data={analysis.categorySpending} />
                <MonthlyTrendsChart data={analysis.monthlySpending} />
              </div>

              {/* Expense Details & Quick Highlights */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5 lg:col-span-2">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-base font-semibold text-slate-100">
                      Category Expense Details
                    </h3>
                    {highestCategory && (
                      <span className="text-xs text-slate-400 tabular-nums">
                        Highest: {highestCategory.category} (
                        {formatINR(highestCategory.spending)})
                      </span>
                    )}
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-800 text-xs font-medium text-slate-400">
                        <tr>
                          <th className="py-2.5 pr-4">Category</th>
                          <th className="py-2.5 text-right">Total Spending (₹)</th>
                          <th className="py-2.5 pl-4 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {analysis.categorySpending.map((item, i) => {
                          const share =
                            analysis.expenses > 0
                              ? (item.spending / analysis.expenses) * 100
                              : 0;
                          return (
                            <tr key={i} className="hover:bg-slate-800/30">
                              <td className="py-2.5 pr-4 font-medium text-slate-200">
                                {item.category}
                              </td>
                              <td className="py-2.5 text-right font-mono text-slate-200 tabular-nums">
                                {formatINR(item.spending)}
                              </td>
                              <td className="py-2.5 pl-4 text-right font-mono text-slate-400 tabular-nums">
                                {share.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Quick Snapshot Card */}
                <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#131C2E] p-5">
                  <div className="space-y-4">
                    <h3 className="text-base font-semibold text-slate-100">
                      Risk & Health Snapshot
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <span className="text-slate-400">30-Day Low Balance</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {formatINR(analysis.lowestBalance)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <span className="text-slate-400">ML Anomalies</span>
                        <span className="font-mono font-semibold text-amber-400 tabular-nums">
                          {analysis.anomalies.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <span className="text-slate-400">Unusual (2.5× Med)</span>
                        <span className="font-mono font-semibold text-red-400 tabular-nums">
                          {analysis.unusualSpending.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Health Score</span>
                        <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                          {analysis.healthScore}/100
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveNav("forecast")}
                      className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Inspect Forecast
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveNav("anomalies")}
                      className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Review Anomalies
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TRANSACTIONS VIEW */}
          {activeNav === "transactions" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                  Transaction Ledger & Categorization
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Automatic rule-based categorization paired with Isolation Forest and personalized baseline scoring
                </p>
              </div>

              {/* Filter Toolbar Card */}
              <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="category-filter"
                      className="mb-1.5 block text-xs font-medium text-slate-400"
                    >
                      Filter by Category
                    </label>
                    <select
                      id="category-filter"
                      value={selectedCategoryFilter}
                      onChange={(e) =>
                        setSelectedCategoryFilter(e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
                    >
                      {categoryOptions.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="search-desc"
                      className="mb-1.5 block text-xs font-medium text-slate-400"
                    >
                      Search Transaction Description
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-500" />
                      <input
                        id="search-desc"
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Search merchant or narration..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pr-3 pl-9 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Ledger Table Card */}
              <div className="rounded-xl border border-slate-800 bg-[#131C2E]">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Transaction History
                  </h3>
                  <span className="text-xs text-slate-400 tabular-nums">
                    Showing {filteredTransactions.length} of{" "}
                    {analysis.transactions.length} transactions
                  </span>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-900/95 text-xs font-medium text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">ML Status</th>
                        <th className="px-4 py-3 text-right">ML Score</th>
                        <th className="px-4 py-3">Personalized Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-10 text-center text-sm text-slate-400"
                          >
                            No transactions match your current filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((tx, i) => (
                          <tr key={i} className="hover:bg-slate-800/30">
                            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-300 tabular-nums">
                              {formatDDMMYYYY(tx.dateMs)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-200">
                              {tx.description}
                            </td>
                            <td className="px-4 py-2.5 text-slate-300">
                              {tx.category}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                                tx.amount > 0
                                  ? "text-emerald-400"
                                  : "text-slate-200"
                              }`}
                            >
                              {formatINR(tx.amount)}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-xs font-medium ${
                                tx.mlPrediction === "Potential Anomaly"
                                  ? "text-amber-400"
                                  : tx.mlPrediction === "Income"
                                    ? "text-emerald-400"
                                    : "text-slate-300"
                              }`}
                            >
                              {tx.mlPrediction}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400 tabular-nums">
                              {tx.mlAnomalyScore !== null
                                ? tx.mlAnomalyScore.toFixed(4)
                                : "—"}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-xs font-medium ${
                                tx.personalizedStatus === "Potentially Unusual"
                                  ? "text-red-400"
                                  : tx.personalizedStatus === "Within Pattern"
                                    ? "text-emerald-400"
                                    : "text-slate-400"
                              }`}
                            >
                              {tx.personalizedStatus}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 30-DAY FORECAST VIEW */}
          {activeNav === "forecast" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                  30-Day Cash Flow Forecast
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Projects daily balances from variable spending rates and recurring monthly commitments
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Starting Balance"
                  value={formatINR(balance)}
                />
                <KpiCard
                  label="Daily Variable Spending"
                  value={formatINR(analysis.dailySpending)}
                  subtext={`${analysis.variableTransactions.length} variable entries`}
                />
                <KpiCard
                  label="Lowest Predicted Balance"
                  value={formatINR(analysis.lowestBalance)}
                  tone={
                    analysis.lowestBalance < 0
                      ? "negative"
                      : analysis.lowestBalance < 5000
                        ? "warning"
                        : "positive"
                  }
                />
              </div>

              {analysis.lowestBalance < 0 ? (
                <StatusCallout type="error" title="Critical Shortage Risk">
                  Your predicted balance may become negative within the next 30
                  days.
                </StatusCallout>
              ) : analysis.lowestBalance < 5000 ? (
                <StatusCallout type="warning" title="Safety Threshold Alert">
                  Warning: Your predicted balance may fall below ₹5,000.00.
                </StatusCallout>
              ) : (
                <StatusCallout type="success" title="Stable Trajectory">
                  Your predicted balance stays above the ₹5,000.00 safety
                  threshold.
                </StatusCallout>
              )}

              <ForecastChart data={analysis.forecast} />

              {/* Collapsible Forecast Debugging */}
              <div className="rounded-xl border border-slate-800 bg-[#131C2E]">
                <button
                  type="button"
                  onClick={() => setShowDebug((prev) => !prev)}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800/40"
                >
                  <span>
                    Forecast Model Breakdown · {analysis.recurringDescriptions.length} recurring items detected
                  </span>
                  {showDebug ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {showDebug && (
                  <div className="space-y-5 border-t border-slate-800 p-5">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold text-slate-300">
                        Recurring Transactions ({analysis.recurringTransactions.length})
                      </h4>
                      <div className="max-h-56 overflow-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-400">
                            <tr>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Description</th>
                              <th className="px-3 py-2">Category</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {analysis.recurringTransactions.map((tx, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2 font-mono tabular-nums">
                                  {tx.dateStr}
                                </td>
                                <td className="px-3 py-2">{tx.description}</td>
                                <td className="px-3 py-2 text-slate-400">
                                  {tx.category}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {formatINR(tx.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-semibold text-slate-300">
                        Variable Transactions ({analysis.variableTransactions.length})
                      </h4>
                      <div className="max-h-56 overflow-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-400">
                            <tr>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Description</th>
                              <th className="px-3 py-2">Category</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {analysis.variableTransactions.map((tx, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2 font-mono tabular-nums">
                                  {tx.dateStr}
                                </td>
                                <td className="px-3 py-2">{tx.description}</td>
                                <td className="px-3 py-2 text-slate-400">
                                  {tx.category}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {formatINR(tx.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ANOMALY DETECTION VIEW */}
          {activeNav === "anomalies" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                  ML & Personalized Anomaly Detection
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Combines Isolation Forest outlier scoring with chronological 2.5× category median baselines
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <KpiCard
                  label="Both Detected"
                  value={String(analysis.combinedCounts.bothDetected)}
                  tone={
                    analysis.combinedCounts.bothDetected > 0
                      ? "negative"
                      : "default"
                  }
                />
                <KpiCard
                  label="Personalized Only"
                  value={String(analysis.combinedCounts.personalizedOnly)}
                  tone={
                    analysis.combinedCounts.personalizedOnly > 0
                      ? "warning"
                      : "default"
                  }
                />
                <KpiCard
                  label="ML Only"
                  value={String(analysis.combinedCounts.mlOnly)}
                />
                <KpiCard
                  label="Normal in Both"
                  value={String(analysis.combinedCounts.normalBoth)}
                  tone="positive"
                />
                <KpiCard
                  label="Insufficient History"
                  value={String(analysis.combinedCounts.insufficient)}
                />
              </div>

              {/* Flagged Personalized Alerts */}
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-slate-100">
                  Personalized Spending Alerts
                </h3>
                {analysis.unusualSpending.length > 0 ? (
                  <div className="space-y-3">
                    {analysis.unusualSpending.map((row, i) => {
                      const baseline = row.personalizedBaseline ?? 0;
                      const amt = Math.abs(row.amount);
                      const ratio = baseline > 0 ? amt / baseline : 0;
                      return (
                        <StatusCallout
                          key={i}
                          type="error"
                          title={`${row.description} · ${formatINR(amt)}`}
                        >
                          Flagged at {ratio.toFixed(2)}× your historical{" "}
                          {row.category} median of {formatINR(baseline)} (based
                          on {row.personalizedHistoryCount} prior transactions).
                        </StatusCallout>
                      );
                    })}
                  </div>
                ) : (
                  <StatusCallout type="success">
                    No potentially unusual spending detected against your
                    historical category medians.
                  </StatusCallout>
                )}
              </div>

              <AnomalyComparisonChart counts={analysis.combinedCounts} />

              {/* Detailed Comparison Table */}
              <div className="rounded-xl border border-slate-800 bg-[#131C2E]">
                <div className="border-b border-slate-800 px-5 py-3.5">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Expense-by-Expense Detection Breakdown
                  </h3>
                </div>
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-900/95 text-xs font-medium text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Personalized</th>
                        <th className="px-4 py-3">ML Prediction</th>
                        <th className="px-4 py-3 text-right">ML Score</th>
                        <th className="px-4 py-3">Combined Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {analysis.expenseTransactions.map((tx, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-300 tabular-nums">
                            {tx.dateStr}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-200">
                            {tx.description}
                          </td>
                          <td className="px-4 py-2.5 text-slate-300">
                            {tx.category}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {formatINR(tx.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {tx.personalizedStatus}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {tx.mlPrediction}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400 tabular-nums">
                            {tx.mlAnomalyScore !== null
                              ? tx.mlAnomalyScore.toFixed(4)
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-xs font-semibold ${
                              tx.combinedStatus === "Detected by Both"
                                ? "text-red-400"
                                : tx.combinedStatus === "Personalized Only"
                                  ? "text-amber-400"
                                  : tx.combinedStatus === "ML Only"
                                    ? "text-violet-400"
                                    : tx.combinedStatus === "Normal in Both"
                                      ? "text-emerald-400"
                                      : "text-slate-400"
                            }`}
                          >
                            {tx.combinedStatus}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PURCHASE SIMULATOR VIEW */}
          {activeNav === "simulator" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                  What-If Purchase Simulator
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Test how a planned expense affects your immediate balance and 30-day cash flow runway
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="sim-purchase"
                      className="mb-1.5 block text-xs font-medium text-slate-400"
                    >
                      Planned Purchase Amount (₹)
                    </label>
                    <input
                      id="sim-purchase"
                      type="number"
                      min={0}
                      step={500}
                      value={purchaseAmount}
                      onChange={(e) =>
                        setPurchaseAmount(
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 tabular-nums focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sim-balance"
                      className="mb-1.5 block text-xs font-medium text-slate-400"
                    >
                      Current Bank Balance (₹)
                    </label>
                    <input
                      id="sim-balance"
                      type="number"
                      min={0}
                      step={500}
                      value={balance}
                      onChange={(e) =>
                        setBalance(Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 tabular-nums focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard label="Current Balance" value={formatINR(balance)} />
                <KpiCard
                  label="After Purchase"
                  value={formatINR(remainingBalanceAfterPurchase)}
                  subtext={`Impact: -${formatINR(purchaseAmount)}`}
                  tone={
                    remainingBalanceAfterPurchase < 0 ? "negative" : "default"
                  }
                />
                <KpiCard
                  label="Lowest Future Balance"
                  value={formatINR(lowestFutureBalanceAfterPurchase)}
                  tone={
                    lowestFutureBalanceAfterPurchase < 0
                      ? "negative"
                      : lowestFutureBalanceAfterPurchase < 5000
                        ? "warning"
                        : "positive"
                  }
                />
              </div>

              {remainingBalanceAfterPurchase < 0 ? (
                <StatusCallout type="error" title="Critical: Unaffordable Now">
                  You cannot afford this purchase with your current bank balance.
                </StatusCallout>
              ) : lowestFutureBalanceAfterPurchase < 0 ? (
                <StatusCallout type="error" title="Critical: Future Overdraft Risk">
                  Your projected 30-day balance may become negative after this
                  purchase.
                </StatusCallout>
              ) : lowestFutureBalanceAfterPurchase < 5000 ? (
                <StatusCallout type="warning" title="Warning: Below Safety Limit">
                  This purchase may push your future balance below the ₹5,000.00
                  safety threshold.
                </StatusCallout>
              ) : (
                <StatusCallout type="success" title="Purchase Appears Affordable">
                  Your balance stays above ₹5,000.00 across the entire 30-day
                  forecast.
                </StatusCallout>
              )}

              <ForecastChart
                data={analysis.forecast}
                purchaseAdjustment={purchaseAmount}
              />

              <p className="text-xs text-slate-400">
                Simulation only: this planned purchase is not persisted to your
                transaction history.
              </p>
            </div>
          )}

          {/* HEALTH SCORE & ADVISOR VIEW */}
          {activeNav === "health" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                  Financial Health Score & Advisor
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Composite 100-point financial wellness score and transparent rule-based recommendations
                </p>
              </div>

              {/* Score Header & Breakdown */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#131C2E] p-6">
                  <div>
                    <div className="text-xs font-medium text-slate-400">
                      Financial Health Score
                    </div>
                    <div className="mt-2 font-mono text-4xl font-bold text-slate-100 tabular-nums">
                      {analysis.healthScore}
                      <span className="text-xl text-slate-500">/100</span>
                    </div>
                    <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          analysis.healthScore >= 80
                            ? "bg-emerald-500"
                            : analysis.healthScore >= 60
                              ? "bg-amber-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${analysis.healthScore}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-5 space-y-1 text-xs text-slate-400">
                    <div>
                      History available: {analysis.historyMonths} months
                    </div>
                    <div>
                      Prediction confidence:{" "}
                      <span className="font-semibold text-slate-200">
                        {analysis.confidence}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#131C2E] p-6 lg:col-span-2">
                  <h3 className="mb-4 text-base font-semibold text-slate-100">
                    Score Breakdown
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          Savings Rate
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums">
                          {analysis.savingsRate.toFixed(1)}% of income saved
                        </div>
                      </div>
                      <span className="font-mono text-base font-semibold text-sky-400 tabular-nums">
                        {analysis.savingsScore}/25
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          Recurring Expenses
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums">
                          {analysis.recurringRatio.toFixed(1)}% of monthly income
                        </div>
                      </div>
                      <span className="font-mono text-base font-semibold text-sky-400 tabular-nums">
                        {analysis.recurringScore}/25
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 sm:border-b-0 sm:pb-0">
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          Emergency Fund
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums">
                          {analysis.emergencyMonths.toFixed(2)} months coverage
                        </div>
                      </div>
                      <span className="font-mono text-base font-semibold text-sky-400 tabular-nums">
                        {analysis.emergencyScore}/25
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          Future Cash Flow
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums">
                          30-day low: {formatINR(analysis.lowestBalance)}
                        </div>
                      </div>
                      <span className="font-mono text-base font-semibold text-sky-400 tabular-nums">
                        {analysis.forecastScore}/25
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {analysis.confidence === "Low" && (
                <StatusCallout type="info">
                  Add at least 3–6 months of transaction history for a more
                  reliable financial health assessment.
                </StatusCallout>
              )}

              {/* Advisor Recommendations */}
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-slate-100">
                  Financial Advisor Insights
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {insights.map((insight, i) => (
                    <StatusCallout
                      key={i}
                      type={insight.level}
                      title={insight.title}
                    >
                      {insight.message}
                    </StatusCallout>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Demo scoring model and rule-based recommendations are
                illustrative only and do not constitute professional financial
                advice.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
