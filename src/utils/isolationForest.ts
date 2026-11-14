// Pure TypeScript Isolation Forest implementation matching scikit-learn's
// IsolationForest semantics for 1D log1p(amount) spending anomaly detection.

export const CATEGORY_PROFILES: Record<string, [number, number]> = {
  Groceries: [1400, 0.45],
  Shopping: [1500, 0.65],
  "Food & Dining": [550, 0.5],
  Transport: [700, 0.9],
  Utilities: [1200, 0.25],
  Entertainment: [350, 0.45],
  Housing: [10000, 0.2],
  Healthcare: [500, 0.65],
  Other: [700, 0.6],
};

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function sampleLognormal(
  rng: () => number,
  meanLog: number,
  sigma: number,
  size: number
): number[] {
  const result: number[] = new Array(size);
  for (let i = 0; i < size; i++) {
    result[i] = Math.exp(meanLog + sigma * sampleNormal(rng));
  }
  return result;
}

const EULER_GAMMA = 0.5772156649;

function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + EULER_GAMMA) - (2 * (n - 1)) / n;
}

interface IsolationTreeNode {
  isLeaf: boolean;
  size: number;
  splitValue?: number;
  left?: IsolationTreeNode;
  right?: IsolationTreeNode;
}

function buildTree(
  data: number[],
  depth: number,
  heightLimit: number,
  rng: () => number
): IsolationTreeNode {
  const n = data.length;
  if (depth >= heightLimit || n <= 1) {
    return { isLeaf: true, size: n };
  }

  let minVal = data[0];
  let maxVal = data[0];
  for (let i = 1; i < n; i++) {
    if (data[i] < minVal) minVal = data[i];
    if (data[i] > maxVal) maxVal = data[i];
  }

  if (maxVal - minVal < 1e-12) {
    return { isLeaf: true, size: n };
  }

  const splitValue = minVal + rng() * (maxVal - minVal);
  const leftData: number[] = [];
  const rightData: number[] = [];
  for (let i = 0; i < n; i++) {
    if (data[i] < splitValue) {
      leftData.push(data[i]);
    } else {
      rightData.push(data[i]);
    }
  }

  return {
    isLeaf: false,
    size: n,
    splitValue,
    left: buildTree(leftData, depth + 1, heightLimit, rng),
    right: buildTree(rightData, depth + 1, heightLimit, rng),
  };
}

function pathLength(
  x: number,
  node: IsolationTreeNode,
  currentDepth: number
): number {
  if (node.isLeaf) {
    return currentDepth + cFactor(node.size);
  }
  if (x < (node.splitValue ?? 0)) {
    return pathLength(x, node.left!, currentDepth + 1);
  }
  return pathLength(x, node.right!, currentDepth + 1);
}

export class IsolationForest1D {
  private trees: IsolationTreeNode[] = [];
  private sampleSize = 256;
  private offset = -0.5;
  private nEstimators: number;
  private contamination: number;
  private randomState: number;

  constructor(options?: {
    nEstimators?: number;
    contamination?: number;
    randomState?: number;
  }) {
    this.nEstimators = options?.nEstimators ?? 100;
    this.contamination = options?.contamination ?? 0.03;
    this.randomState = options?.randomState ?? 42;
  }

  fit(values: number[]): this {
    const n = values.length;
    if (n === 0) return this;

    const rng = createRng(this.randomState);
    this.sampleSize = Math.min(256, n);
    const heightLimit = Math.ceil(Math.log2(Math.max(this.sampleSize, 2)));

    this.trees = [];
    for (let t = 0; t < this.nEstimators; t++) {
      const sample: number[] = [];
      if (n <= this.sampleSize) {
        for (let i = 0; i < n; i++) sample.push(values[i]);
      } else {
        // Fisher-Yates partial sample without replacement
        const indices = new Array<number>(n);
        for (let i = 0; i < n; i++) indices[i] = i;
        for (let i = 0; i < this.sampleSize; i++) {
          const j = i + Math.floor(rng() * (n - i));
          const tmp = indices[i];
          indices[i] = indices[j];
          indices[j] = tmp;
          sample.push(values[indices[i]]);
        }
      }
      this.trees.push(buildTree(sample, 0, heightLimit, rng));
    }

    // Compute raw scores (-2^(-E(h)/c(psi))) and set offset at contamination percentile
    const rawScores = values.map((v) => this.rawScore(v));
    const sorted = [...rawScores].sort((a, b) => a - b);
    const idx = Math.max(
      0,
      Math.min(
        sorted.length - 1,
        Math.floor(this.contamination * sorted.length)
      )
    );
    this.offset = sorted[idx];
    return this;
  }

  private rawScore(x: number): number {
    if (this.trees.length === 0) return -0.5;
    let totalPath = 0;
    for (let i = 0; i < this.trees.length; i++) {
      totalPath += pathLength(x, this.trees[i], 0);
    }
    const avgPath = totalPath / this.trees.length;
    const denom = cFactor(this.sampleSize);
    const s = denom > 0 ? Math.pow(2, -avgPath / denom) : 0.5;
    return -s;
  }

  decisionFunction(x: number): number {
    return this.rawScore(x) - this.offset;
  }

  predict(x: number): 1 | -1 {
    return this.decisionFunction(x) < 0 ? -1 : 1;
  }
}

let cachedSyntheticModels: Record<string, IsolationForest1D> | null = null;

export function getSyntheticModels(): Record<string, IsolationForest1D> {
  if (cachedSyntheticModels) return cachedSyntheticModels;

  const rng = createRng(42);
  const models: Record<string, IsolationForest1D> = {};

  for (const [category, [medianAmount, variation]] of Object.entries(
    CATEGORY_PROFILES
  )) {
    const amounts = sampleLognormal(rng, Math.log(medianAmount), variation, 1000);
    const logAmounts = amounts.map((a) => Math.log1p(a));
    const model = new IsolationForest1D({
      nEstimators: 100,
      contamination: 0.03,
      randomState: 42,
    });
    model.fit(logAmounts);
    models[category] = model;
  }

  cachedSyntheticModels = models;
  return models;
}

export function trainPersonalizedModels(
  expenses: Array<{ category: string; amount: number }>
): Record<string, IsolationForest1D> {
  const byCategory: Record<string, number[]> = {};
  for (const tx of expenses) {
    if (tx.amount < 0) {
      const absAmt = Math.abs(tx.amount);
      if (!byCategory[tx.category]) byCategory[tx.category] = [];
      byCategory[tx.category].push(absAmt);
    }
  }

  const models: Record<string, IsolationForest1D> = {};
  for (const [category, amounts] of Object.entries(byCategory)) {
    if (amounts.length < 10) continue;
    const logAmounts = amounts.map((a) => Math.log1p(a));
    const model = new IsolationForest1D({
      nEstimators: 100,
      contamination: 0.05,
      randomState: 42,
    });
    model.fit(logAmounts);
    models[category] = model;
  }

  return models;
}
