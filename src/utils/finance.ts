import Papa from "papaparse";
import {
  getSyntheticModels,
  trainPersonalizedModels,
} from "./isolationForest";

export interface RawTransaction {
  dateStr: string; // YYYY-MM-DD
  dateMs: number; // UTC midnight ms
  description: string;
  amount: number;
}

export interface AnalyzedTransaction extends RawTransaction {
  category: string;
  mlPrediction: "Income" | "Potential Anomaly" | "Normal";
  mlAnomalyScore: number | null;
  personalizedStatus:
    | "Income"
    | "Potentially Unusual"
    | "Within Pattern"
    | "Insufficient History";
  personalizedBaseline: number | null;
  personalizedHistoryCount: number;
  combinedStatus:
    | "Income"
    | "Detected by Both"
    | "Personalized Only"
    | "ML Only"
    | "Normal in Both"
    | "Insufficient History";
}

export interface CsvParseResult {
  transactions: RawTransaction[];
  duplicatesRemoved: number;
  error?: string;
  columnsFound?: string[];
}

export interface ForecastPoint {
  dateStr: string;
  predictedBalance: number;
}

export interface CategorySpending {
  category: string;
  spending: number;
}

export interface MonthlySpending {
  month: string;
  spending: number;
}

export interface AdvisorInsight {
  title: string;
  message: string;
  level: "warning" | "success" | "info";
}

export const SAMPLE_CSV = `date,description,amount
2026-10-01,Salary,30000
2026-10-02,Grocery Store,-1500
2026-10-03,Amazon Shopping,-2000
2026-10-05,Rent,-8000
2026-10-08,Restaurant,-500
2026-10-10,Electricity Bill,-1200
2026-10-15,Netflix,-199
2026-11-01,Salary,30000
2026-11-02,Grocery Store,-1800
2026-11-03,Amazon Shopping,-1500
2026-11-05,Rent,-8000
2026-11-08,Restaurant,-700
2026-11-10,Electricity Bill,-1300
2026-11-15,Netflix,-199
2026-11-16,Grocery Store,-8000`;

const MS_PER_DAY = 86_400_000;

function parseDateToUTC(raw: string): { dateStr: string; dateMs: number } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Match YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const ms = Date.UTC(y, mo - 1, d);
    const dt = new Date(ms);
    if (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === mo - 1 &&
      dt.getUTCDate() === d
    ) {
      return { dateStr: formatYYYYMMDD(ms), dateMs: ms };
    }
  }

  // Match DD-MM-YYYY or DD/MM/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const p1 = Number(m[1]);
    const p2 = Number(m[2]);
    const y = Number(m[3]);
    // Prefer DD-MM-YYYY if p1 > 12 or standard INR format, fallback to MM/DD if p2 > 12
    let d = p1;
    let mo = p2;
    if (p2 > 12 && p1 <= 12) {
      mo = p1;
      d = p2;
    }
    const ms = Date.UTC(y, mo - 1, d);
    const dt = new Date(ms);
    if (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === mo - 1 &&
      dt.getUTCDate() === d
    ) {
      return { dateStr: formatYYYYMMDD(ms), dateMs: ms };
    }
  }

  // Fallback native Date parsing
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const ms = Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
    return { dateStr: formatYYYYMMDD(ms), dateMs: ms };
  }

  return null;
}

export function formatYYYYMMDD(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDDMMYYYY(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}-${m}-${y}`;
}

function addOneMonthUTC(ms: number): number {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const targetMonth = month + 1;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normMonth = targetMonth % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, normMonth + 1, 0)
  ).getUTCDate();
  return Date.UTC(targetYear, normMonth, Math.min(day, lastDayOfTargetMonth));
}

function parseNumberClean(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const cleaned = String(val).replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseTransactionCSV(csvText: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (!parsed.data || parsed.data.length === 0) {
    return {
      transactions: [],
      duplicatesRemoved: 0,
      error: "No valid transactions found in the uploaded CSV.",
    };
  }

  const rawHeaders = parsed.meta.fields ?? [];
  const normalizedMap: Record<string, string> = {};
  const standardizedColumns: string[] = [];

  for (const h of rawHeaders) {
    let std = h.trim().toLowerCase();
    if (std === "transaction" || std === "narration" || std === "particulars") {
      std = "description";
    } else if (std === "transaction date") {
      std = "date";
    } else if (std === "transaction amount") {
      std = "amount";
    }
    normalizedMap[h] = std;
    if (!standardizedColumns.includes(std)) {
      standardizedColumns.push(std);
    }
  }

  const hasAmount = standardizedColumns.includes("amount");
  const hasDebitCredit =
    standardizedColumns.includes("debit") &&
    standardizedColumns.includes("credit");

  if (!hasAmount && !hasDebitCredit) {
    return {
      transactions: [],
      duplicatesRemoved: 0,
      error: "CSV must contain Amount or both Debit and Credit.",
      columnsFound: standardizedColumns,
    };
  }

  const requiredColumns = ["date", "description", "amount"];
  const effectiveCols = hasAmount
    ? standardizedColumns
    : [...standardizedColumns, "amount"];
  const missingColumns = requiredColumns.filter(
    (c) => !effectiveCols.includes(c)
  );

  if (missingColumns.length > 0) {
    return {
      transactions: [],
      duplicatesRemoved: 0,
      error: `Missing columns: ${missingColumns.join(", ")}`,
      columnsFound: standardizedColumns,
    };
  }

  const validRows: RawTransaction[] = [];

  for (const row of parsed.data) {
    const mapped: Record<string, unknown> = {};
    for (const [origKey, val] of Object.entries(row)) {
      const stdKey = normalizedMap[origKey];
      if (stdKey) mapped[stdKey] = val;
    }

    const parsedDate = parseDateToUTC(String(mapped["date"] ?? ""));
    const description = String(mapped["description"] ?? "").trim();

    let amount: number | null = null;
    if (hasAmount) {
      amount = parseNumberClean(mapped["amount"]);
    } else {
      const debit = parseNumberClean(mapped["debit"]) ?? 0;
      const credit = parseNumberClean(mapped["credit"]) ?? 0;
      amount = credit - debit;
    }

    if (!parsedDate || amount === null || description === "") {
      continue;
    }

    validRows.push({
      dateStr: parsedDate.dateStr,
      dateMs: parsedDate.dateMs,
      description,
      amount,
    });
  }

  // Remove exact duplicates
  const seen = new Set<string>();
  const deduped: RawTransaction[] = [];
  for (const row of validRows) {
    const key = `${row.dateStr}|${row.description}|${row.amount}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  const duplicatesRemoved = validRows.length - deduped.length;

  if (deduped.length === 0) {
    return {
      transactions: [],
      duplicatesRemoved,
      error: "No valid transactions found in the uploaded CSV.",
    };
  }

  return {
    transactions: deduped,
    duplicatesRemoved,
  };
}

export function categorizeTransaction(
  description: string,
  amount: number
): string {
  const desc = description.toLowerCase();

  if (amount > 0) return "Income";
  if (
    desc.includes("grocery") ||
    desc.includes("supermarket") ||
    desc.includes("vegetables")
  ) {
    return "Groceries";
  }
  if (
    desc.includes("amazon") ||
    desc.includes("flipkart") ||
    desc.includes("shopping")
  ) {
    return "Shopping";
  }
  if (
    desc.includes("restaurant") ||
    desc.includes("swiggy") ||
    desc.includes("zomato") ||
    desc.includes("food") ||
    desc.includes("cafe")
  ) {
    return "Food & Dining";
  }
  if (
    desc.includes("uber") ||
    desc.includes("ola") ||
    desc.includes("petrol") ||
    desc.includes("fuel") ||
    desc.includes("transport")
  ) {
    return "Transport";
  }
  if (
    desc.includes("electricity") ||
    desc.includes("water bill") ||
    desc.includes("gas bill") ||
    desc.includes("internet")
  ) {
    return "Utilities";
  }
  if (
    desc.includes("netflix") ||
    desc.includes("spotify") ||
    desc.includes("prime") ||
    desc.includes("movie")
  ) {
    return "Entertainment";
  }
  if (desc.includes("rent") || desc.includes("mortgage")) {
    return "Housing";
  }
  if (
    desc.includes("hospital") ||
    desc.includes("medical") ||
    desc.includes("pharmacy") ||
    desc.includes("medicine")
  ) {
    return "Healthcare";
  }
  return "Other";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function formatINR(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface DashboardAnalysis {
  transactions: AnalyzedTransaction[];
  personalizedModelCount: number;
  income: number;
  expenses: number;
  netCashflow: number;
  dailyFlow: Array<{ dateStr: string; amount: number; cumulativeCashFlow: number }>;
  recurringDescriptions: string[];
  recurringTransactions: AnalyzedTransaction[];
  variableTransactions: AnalyzedTransaction[];
  dailySpending: number;
  forecast: ForecastPoint[];
  lowestBalance: number;
  anomalies: AnalyzedTransaction[];
  unusualSpending: AnalyzedTransaction[];
  insufficientHistoryCount: number;
  expenseTransactions: AnalyzedTransaction[];
  combinedCounts: {
    bothDetected: number;
    personalizedOnly: number;
    mlOnly: number;
    normalBoth: number;
    insufficient: number;
  };
  categorySpending: CategorySpending[];
  monthlySpending: MonthlySpending[];
  recurringExpensesTotal: number;
  historyMonths: number;
  savingsRate: number;
  savingsScore: number;
  recurringRatio: number;
  recurringScore: number;
  emergencyMonths: number;
  emergencyScore: number;
  forecastScore: number;
  healthScore: number;
  confidence: "Low" | "Medium" | "Higher";
}

export function analyzeFinancialData(
  rawTransactions: RawTransaction[],
  balance: number
): DashboardAnalysis {
  // Sort chronologically (same as personalized analysis in dashboard.py)
  const sortedRaw = [...rawTransactions].sort((a, b) => a.dateMs - b.dateMs);

  const categorized = sortedRaw.map((tx) => ({
    ...tx,
    category: categorizeTransaction(tx.description, tx.amount),
  }));

  const personalizedModels = trainPersonalizedModels(categorized);
  const syntheticModels = getSyntheticModels();
  const personalizedModelCount = Object.keys(personalizedModels).length;

  const spendingHistory: Record<string, number[]> = {};

  const transactions: AnalyzedTransaction[] = categorized.map((tx) => {
    // ML analysis (prefer personalized model when available, else synthetic)
    let mlPrediction: AnalyzedTransaction["mlPrediction"] = "Income";
    let mlAnomalyScore: number | null = null;

    if (tx.amount < 0) {
      const absAmt = Math.abs(tx.amount);
      const cat =
        tx.category in syntheticModels || tx.category in personalizedModels
          ? tx.category
          : "Other";
      const model =
        personalizedModels[cat] ??
        syntheticModels[cat] ??
        syntheticModels["Other"];
      const x = Math.log1p(absAmt);
      const pred = model.predict(x);
      const score = -model.decisionFunction(x);
      mlPrediction = pred === -1 ? "Potential Anomaly" : "Normal";
      mlAnomalyScore = Math.round(score * 10000) / 10000;
    }

    // Personalized chronological spending baseline analysis
    let personalizedStatus: AnalyzedTransaction["personalizedStatus"] = "Income";
    let personalizedBaseline: number | null = null;
    let personalizedHistoryCount = 0;

    if (tx.amount < 0) {
      const absAmt = Math.abs(tx.amount);
      const prev = spendingHistory[tx.category] ?? [];
      personalizedHistoryCount = prev.length;

      if (prev.length > 0) {
        personalizedBaseline = median(prev);
        personalizedStatus =
          absAmt > personalizedBaseline * 2.5
            ? "Potentially Unusual"
            : "Within Pattern";
      } else {
        personalizedStatus = "Insufficient History";
      }

      if (!spendingHistory[tx.category]) spendingHistory[tx.category] = [];
      spendingHistory[tx.category].push(absAmt);
    }

    // Combined status
    let combinedStatus: AnalyzedTransaction["combinedStatus"] = "Income";
    if (tx.amount < 0) {
      const pFlag = personalizedStatus === "Potentially Unusual";
      const mFlag = mlPrediction === "Potential Anomaly";
      if (pFlag && mFlag) combinedStatus = "Detected by Both";
      else if (pFlag && !mFlag) combinedStatus = "Personalized Only";
      else if (!pFlag && mFlag) combinedStatus = "ML Only";
      else if (personalizedStatus === "Within Pattern" && mlPrediction === "Normal")
        combinedStatus = "Normal in Both";
      else combinedStatus = "Insufficient History";
    }

    return {
      ...tx,
      mlPrediction,
      mlAnomalyScore,
      personalizedStatus,
      personalizedBaseline,
      personalizedHistoryCount,
      combinedStatus,
    };
  });

  // Financial overview
  let income = 0;
  let expensesAbs = 0;
  for (const tx of transactions) {
    if (tx.amount > 0) income += tx.amount;
    else if (tx.amount < 0) expensesAbs += Math.abs(tx.amount);
  }
  const netCashflow = income - expensesAbs;

  // Daily cumulative cash flow
  const dailyMap = new Map<string, { dateMs: number; amount: number }>();
  for (const tx of transactions) {
    const existing = dailyMap.get(tx.dateStr);
    if (existing) {
      existing.amount += tx.amount;
    } else {
      dailyMap.set(tx.dateStr, { dateMs: tx.dateMs, amount: tx.amount });
    }
  }
  const dailyEntries = Array.from(dailyMap.entries()).sort(
    (a, b) => a[1].dateMs - b[1].dateMs
  );
  let cum = 0;
  const dailyFlow = dailyEntries.map(([dateStr, val]) => {
    cum += val.amount;
    return { dateStr, amount: val.amount, cumulativeCashFlow: cum };
  });

  // Recurring transactions detection
  const byDesc = new Map<string, AnalyzedTransaction[]>();
  for (const tx of transactions) {
    const list = byDesc.get(tx.description) ?? [];
    list.push(tx);
    byDesc.set(tx.description, list);
  }

  const recurringDescriptions: string[] = [];
  for (const [desc, group] of byDesc.entries()) {
    if (group.length < 2) continue;
    const sortedGroup = [...group].sort((a, b) => a.dateMs - b.dateMs);
    let intervalsValid = true;
    for (let i = 1; i < sortedGroup.length; i++) {
      const diffDays = (sortedGroup[i].dateMs - sortedGroup[i - 1].dateMs) / MS_PER_DAY;
      if (diffDays < 25 || diffDays > 35) {
        intervalsValid = false;
        break;
      }
    }
    const amts = sortedGroup.map((t) => Math.abs(t.amount));
    const minAmt = Math.min(...amts);
    const maxAmt = Math.max(...amts);
    const meanAmt = amts.reduce((s, v) => s + v, 0) / amts.length;
    if (intervalsValid && maxAmt - minAmt <= meanAmt * 0.1) {
      recurringDescriptions.push(desc);
    }
  }

  const recurringSet = new Set(recurringDescriptions);
  const recurringTransactions = transactions.filter((t) =>
    recurringSet.has(t.description)
  );
  const variableTransactions = transactions.filter(
    (t) => !recurringSet.has(t.description)
  );

  const minDateMs = transactions[0].dateMs;
  const maxDateMs = transactions[transactions.length - 1].dateMs;
  const historyDays = Math.floor((maxDateMs - minDateMs) / MS_PER_DAY) + 1;

  const variableExpenses = variableTransactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const dailySpending = historyDays > 0 ? variableExpenses / historyDays : 0;

  // Precompute next expected date for each recurring description
  const recurringNextEvents: Array<{ nextDateMs: number; amount: number }> = [];
  for (const desc of recurringDescriptions) {
    const group = recurringTransactions
      .filter((t) => t.description === desc)
      .sort((a, b) => a.dateMs - b.dateMs);
    const lastTx = group[group.length - 1];
    recurringNextEvents.push({
      nextDateMs: addOneMonthUTC(lastTx.dateMs),
      amount: lastTx.amount,
    });
  }

  let futureBalance = balance;
  const forecast: ForecastPoint[] = [];
  for (let i = 1; i <= 30; i++) {
    const dayMs = maxDateMs + i * MS_PER_DAY;
    futureBalance -= dailySpending;
    for (const evt of recurringNextEvents) {
      if (dayMs === evt.nextDateMs) {
        futureBalance += evt.amount;
      }
    }
    forecast.push({
      dateStr: formatYYYYMMDD(dayMs),
      predictedBalance: futureBalance,
    });
  }

  const lowestBalance =
    forecast.length > 0
      ? Math.min(...forecast.map((f) => f.predictedBalance))
      : balance;

  // Expense subsets & anomaly counts
  const expenseTransactions = transactions.filter((t) => t.amount < 0);
  const anomalies = transactions.filter(
    (t) => t.mlPrediction === "Potential Anomaly"
  );
  const unusualSpending = transactions.filter(
    (t) => t.personalizedStatus === "Potentially Unusual"
  );
  const insufficientHistoryCount = transactions.filter(
    (t) => t.personalizedStatus === "Insufficient History"
  ).length;

  const combinedCounts = {
    bothDetected: expenseTransactions.filter(
      (t) => t.combinedStatus === "Detected by Both"
    ).length,
    personalizedOnly: expenseTransactions.filter(
      (t) => t.combinedStatus === "Personalized Only"
    ).length,
    mlOnly: expenseTransactions.filter((t) => t.combinedStatus === "ML Only")
      .length,
    normalBoth: expenseTransactions.filter(
      (t) => t.combinedStatus === "Normal in Both"
    ).length,
    insufficient: expenseTransactions.filter(
      (t) => t.combinedStatus === "Insufficient History"
    ).length,
  };

  // Category spending breakdown
  const catTotals = new Map<string, number>();
  for (const tx of expenseTransactions) {
    catTotals.set(
      tx.category,
      (catTotals.get(tx.category) ?? 0) + Math.abs(tx.amount)
    );
  }
  const categorySpending = Array.from(catTotals.entries())
    .map(([category, spending]) => ({ category, spending }))
    .sort((a, b) => b.spending - a.spending);

  // Monthly spending trends
  const monthTotals = new Map<string, number>();
  for (const tx of expenseTransactions) {
    const month = tx.dateStr.slice(0, 7);
    monthTotals.set(
      month,
      (monthTotals.get(month) ?? 0) + Math.abs(tx.amount)
    );
  }
  const monthlySpending = Array.from(monthTotals.entries())
    .map(([month, spending]) => ({ month, spending }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Financial Health Score
  const recurringExpensesTotal = recurringTransactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const uniqueMonths = new Set(transactions.map((t) => t.dateStr.slice(0, 7)));
  const historyMonths = Math.max(1, uniqueMonths.size);

  const monthlyIncome = income / historyMonths;
  const monthlyExpenses = expensesAbs / historyMonths;
  const monthlyRecurringExpenses = recurringExpensesTotal / historyMonths;

  const savingsRate = income > 0 ? (netCashflow / income) * 100 : 0;
  let savingsScore = 0;
  if (savingsRate >= 20) savingsScore = 25;
  else if (savingsRate >= 10) savingsScore = 20;
  else if (savingsRate > 0) savingsScore = 10;

  const recurringRatio =
    monthlyIncome > 0 ? (monthlyRecurringExpenses / monthlyIncome) * 100 : 100;
  let recurringScore = 0;
  if (recurringRatio <= 30) recurringScore = 25;
  else if (recurringRatio <= 40) recurringScore = 20;
  else if (recurringRatio <= 50) recurringScore = 10;

  const emergencyMonths = monthlyExpenses > 0 ? balance / monthlyExpenses : 0;
  let emergencyScore = 0;
  if (emergencyMonths >= 3) emergencyScore = 25;
  else if (emergencyMonths >= 2) emergencyScore = 20;
  else if (emergencyMonths >= 1) emergencyScore = 15;
  else if (emergencyMonths >= 0.5) emergencyScore = 10;

  let forecastScore = 0;
  if (lowestBalance >= monthlyExpenses) forecastScore = 25;
  else if (lowestBalance >= monthlyExpenses * 0.5) forecastScore = 18;
  else if (lowestBalance >= 0) forecastScore = 10;

  const healthScore =
    savingsScore + recurringScore + emergencyScore + forecastScore;

  let confidence: "Low" | "Medium" | "Higher" = "Higher";
  if (historyMonths < 3) confidence = "Low";
  else if (historyMonths < 6) confidence = "Medium";

  return {
    transactions,
    personalizedModelCount,
    income,
    expenses: expensesAbs,
    netCashflow,
    dailyFlow,
    recurringDescriptions,
    recurringTransactions,
    variableTransactions,
    dailySpending,
    forecast,
    lowestBalance,
    anomalies,
    unusualSpending,
    insufficientHistoryCount,
    expenseTransactions,
    combinedCounts,
    categorySpending,
    monthlySpending,
    recurringExpensesTotal,
    historyMonths,
    savingsRate,
    savingsScore,
    recurringRatio,
    recurringScore,
    emergencyMonths,
    emergencyScore,
    forecastScore,
    healthScore,
    confidence,
  };
}

export function buildAdvisorInsights(
  analysis: DashboardAnalysis,
  purchaseAmount: number,
  lowestFutureBalanceAfterPurchase: number
): AdvisorInsight[] {
  const insights: AdvisorInsight[] = [];

  if (analysis.savingsRate < 10) {
    insights.push({
      title: "Low Savings Rate",
      message: `Your savings rate is only ${analysis.savingsRate.toFixed(1)}%. Try reducing non-essential spending and building your savings.`,
      level: "warning",
    });
  } else if (analysis.savingsRate >= 20) {
    insights.push({
      title: "Good Savings Rate",
      message: `Your savings rate is ${analysis.savingsRate.toFixed(1)}%. You're saving a healthy portion of your recorded income.`,
      level: "success",
    });
  } else {
    insights.push({
      title: "Savings Opportunity",
      message: `Your savings rate is ${analysis.savingsRate.toFixed(1)}%. Try gradually increasing the amount you save each month.`,
      level: "info",
    });
  }

  if (analysis.recurringRatio > 40) {
    insights.push({
      title: "High Recurring Commitments",
      message: `Recurring expenses use ${analysis.recurringRatio.toFixed(1)}% of your monthly income. Review subscriptions and other recurring payments.`,
      level: "warning",
    });
  } else {
    insights.push({
      title: "Recurring Expenses Under Control",
      message: `Recurring expenses use ${analysis.recurringRatio.toFixed(1)}% of your monthly income.`,
      level: "success",
    });
  }

  if (analysis.emergencyMonths < 1) {
    insights.push({
      title: "Emergency Fund Needs Attention",
      message: `Your current balance covers only ${analysis.emergencyMonths.toFixed(2)} months of average expenses. Work towards building an emergency fund.`,
      level: "warning",
    });
  } else if (analysis.emergencyMonths < 3) {
    insights.push({
      title: "Build Your Emergency Fund",
      message: `You have approximately ${analysis.emergencyMonths.toFixed(2)} months of expense coverage. Aim for at least 3 months.`,
      level: "info",
    });
  } else {
    insights.push({
      title: "Good Emergency Fund Coverage",
      message: `Your current balance covers ${analysis.emergencyMonths.toFixed(2)} months of average expenses.`,
      level: "success",
    });
  }

  if (analysis.lowestBalance < 0) {
    insights.push({
      title: "Future Cash Shortage Risk",
      message: `Your projected balance may fall to ${formatINR(analysis.lowestBalance)}. Review upcoming expenses and recurring payments.`,
      level: "warning",
    });
  } else if (analysis.lowestBalance < 5000) {
    insights.push({
      title: "Low Future Balance",
      message: `Your projected balance may fall to ${formatINR(analysis.lowestBalance)}. Consider keeping additional money available.`,
      level: "warning",
    });
  } else {
    insights.push({
      title: "Future Cash Flow Looks Stable",
      message: `Your lowest projected balance is ${formatINR(analysis.lowestBalance)}.`,
      level: "success",
    });
  }

  if (purchaseAmount > 0 && lowestFutureBalanceAfterPurchase < 5000) {
    insights.push({
      title: "Purchase Recommendation",
      message: `After a purchase of ${formatINR(purchaseAmount)}, your projected lowest balance becomes ${formatINR(lowestFutureBalanceAfterPurchase)}. Consider reducing or postponing this purchase.`,
      level: "warning",
    });
  }

  return insights;
}
