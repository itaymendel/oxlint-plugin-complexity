import type { Context, ESTreeNode, FunctionNode, Visitor, ComplexityPoint } from '../types.js';
import { getFunctionName } from '../utils.js';
import {
  createCombinedComplexityVisitor,
  type CombinedComplexityResult,
} from '../combined-visitor.js';
import { createHalsteadVisitorHandlers } from './halstead-visitor.js';
import {
  calculateHalsteadMetrics,
  createHalsteadCounts,
  type HalsteadCounts,
  type HalsteadMetrics,
} from './halstead.js';

export interface FunctionMetrics {
  name: string;
  lineStart: number;
  lineEnd: number;
  loc: number;
  cyclomatic: number;
  cognitive: number;
  halstead: HalsteadMetrics;
  cyclomaticPoints: ComplexityPoint[];
  cognitivePoints: ComplexityPoint[];
}

export interface AggregateComplexity {
  sum: number;
  max: number;
  average: number;
  countAboveThreshold: number;
}

export interface MIDecomposition {
  /** 3.42 * ln(avgEffort) — how much expression complexity lowers MI */
  effortTerm: number;
  /** 0.23 * ln(avgCyclomatic) — how much branching lowers MI */
  cyclomaticTerm: number;
  /** 16.2 * ln(avgLOC) — how much code length lowers MI */
  locTerm: number;
  /** Which factor contributes the most to lowering MI */
  mainContributor: 'effort' | 'cyclomatic' | 'loc';
}

export interface ModuleAnalysisResult {
  functions: FunctionMetrics[];
  halstead: HalsteadMetrics;
  cyclomatic: AggregateComplexity;
  cognitive: AggregateComplexity;
  /** Module complexity score (0-100, higher = more complex). Inverted Maintainability Index. */
  moduleComplexity: number;
  complexityDecomposition: MIDecomposition;
  totalLOC: number;
  functionCount: number;
}

export interface ModuleComplexityOptions {
  moduleComplexity?: number;
  maxCyclomaticSum?: number;
  maxCognitiveSum?: number;
  cyclomaticThreshold?: number;
  cognitiveThreshold?: number;
}

/**
 * Module complexity = 100 - scaled Maintainability Index.
 *
 * MI = 171 - 3.42 * ln(avgEffort) - 0.23 * ln(avgCyclomatic) - 16.2 * ln(avgLOC)
 * Scaled MI = max(0, MI * 100 / 171)
 * Module complexity = 100 - Scaled MI   (0 = trivial, 100 = maximally complex)
 */
export function calculateModuleComplexity(
  avgEffort: number,
  avgCyclomatic: number,
  avgLOC: number
): { score: number; decomposition: MIDecomposition } {
  const lnEffort = Math.log(Math.max(avgEffort, 1));
  const lnCyclomatic = Math.log(Math.max(avgCyclomatic, 1));
  const lnLOC = Math.log(Math.max(avgLOC, 1));

  const effortTerm = 3.42 * lnEffort;
  const cyclomaticTerm = 0.23 * lnCyclomatic;
  const locTerm = 16.2 * lnLOC;

  const rawMI = 171 - effortTerm - cyclomaticTerm - locTerm;
  const scaledMI = Math.max(0, (rawMI * 100) / 171);
  const score = Math.min(100, 100 - scaledMI);

  let mainContributor: MIDecomposition['mainContributor'] = 'effort';
  if (locTerm >= effortTerm && locTerm >= cyclomaticTerm) {
    mainContributor = 'loc';
  } else if (cyclomaticTerm >= effortTerm) {
    mainContributor = 'cyclomatic';
  }

  return {
    score,
    decomposition: { effortTerm, cyclomaticTerm, locTerm, mainContributor },
  };
}

/** If no functions, treats the whole module as one function. */
export function computeMIInputs(
  functionCount: number,
  totalCyclomatic: number,
  totalLOC: number,
  moduleHalstead: HalsteadMetrics,
  functionEffortSum: number
): { avgEffort: number; avgCyclomatic: number; avgLOC: number } {
  if (functionCount === 0) {
    return {
      avgEffort: moduleHalstead.effort,
      avgCyclomatic: 1,
      avgLOC: Math.max(totalLOC, 1),
    };
  }

  return {
    avgEffort: functionEffortSum / functionCount,
    avgCyclomatic: totalCyclomatic / functionCount,
    avgLOC: totalLOC / functionCount,
  };
}

interface PendingFunction {
  node: ESTreeNode;
  name: string;
  result: CombinedComplexityResult;
  halsteadCounts: HalsteadCounts;
}

/**
 * Creates a visitor that computes cyclomatic + cognitive + Halstead per function,
 * then aggregates into module-level metrics with Maintainability Index on Program:exit.
 */
export function createModuleAnalysisVisitor(
  context: Context,
  onModuleAnalyzed: (result: ModuleAnalysisResult) => void,
  onFunctionAnalyzed?: (result: CombinedComplexityResult, node: ESTreeNode) => void,
  options?: ModuleComplexityOptions
): Visitor {
  const opts = options ?? {};
  const cyclomaticThreshold = opts.cyclomaticThreshold ?? 10;
  const cognitiveThreshold = opts.cognitiveThreshold ?? 10;

  const pendingFunctions: PendingFunction[] = [];

  const combinedVisitor = createCombinedComplexityVisitor(
    context,
    (result: CombinedComplexityResult, node: ESTreeNode) => {
      const funcNode = node as FunctionNode;
      const name = getFunctionName(funcNode, funcNode.parent);
      pendingFunctions.push({ node, name, result, halsteadCounts: createHalsteadCounts() });
      onFunctionAnalyzed?.(result, node);
    }
  );

  const { handlers: halsteadHandlers, moduleCounts } = createHalsteadVisitorHandlers({
    onFunctionExit(counts) {
      const last = pendingFunctions[pendingFunctions.length - 1];
      if (last) last.halsteadCounts = counts;
    },
  });

  // Merge both visitors: for overlapping keys, call both handlers
  const combinedHandlerMap = combinedVisitor as Record<
    string,
    ((node: ESTreeNode) => void) | undefined
  >;
  const allKeys = new Set([...Object.keys(combinedVisitor), ...Object.keys(halsteadHandlers)]);
  const mergedVisitor: Record<string, (node: ESTreeNode) => void> = {};

  for (const key of allKeys) {
    const a = combinedHandlerMap[key];
    const b = halsteadHandlers[key];
    const handler =
      a && b
        ? (node: ESTreeNode) => {
            a(node);
            b(node);
          }
        : (a ?? b);
    if (handler) mergedVisitor[key] = handler;
  }

  // Reset per-file state when entering a new Program (prevents accumulation across files)
  const originalProgramEnter = mergedVisitor['Program'];
  mergedVisitor['Program'] = (node: ESTreeNode) => {
    pendingFunctions.length = 0;
    moduleCounts.operators.clear();
    moduleCounts.operands.clear();
    originalProgramEnter?.(node);
  };

  const originalProgramExit = mergedVisitor['Program:exit'];
  mergedVisitor['Program:exit'] = (node: ESTreeNode) => {
    originalProgramExit?.(node);

    const totalLOC = node.loc ? node.loc.end.line : 0;

    const functions: FunctionMetrics[] = pendingFunctions.map((pf) => {
      const halstead = calculateHalsteadMetrics(pf.halsteadCounts);

      const lineStart = pf.node.loc?.start.line ?? 0;
      const lineEnd = pf.node.loc?.end.line ?? 0;
      const loc = Math.max(lineEnd - lineStart + 1, 1);

      return {
        name: pf.name,
        lineStart,
        lineEnd,
        loc,
        cyclomatic: pf.result.cyclomatic,
        cognitive: pf.result.cognitive,
        halstead,
        cyclomaticPoints: pf.result.cyclomaticPoints,
        cognitivePoints: pf.result.cognitivePoints,
      };
    });

    const moduleHalstead = calculateHalsteadMetrics(moduleCounts);

    const cyclomatic = aggregateComplexity(
      functions.map((f) => f.cyclomatic),
      cyclomaticThreshold
    );
    const cognitive = aggregateComplexity(
      functions.map((f) => f.cognitive),
      cognitiveThreshold
    );

    const functionEffortSum = functions.reduce((sum, f) => sum + f.halstead.effort, 0);
    const miInputs = computeMIInputs(
      functions.length,
      cyclomatic.sum,
      totalLOC,
      moduleHalstead,
      functionEffortSum
    );
    const mc = calculateModuleComplexity(
      miInputs.avgEffort,
      miInputs.avgCyclomatic,
      miInputs.avgLOC
    );

    onModuleAnalyzed({
      functions,
      halstead: moduleHalstead,
      cyclomatic,
      cognitive,
      moduleComplexity: mc.score,
      complexityDecomposition: mc.decomposition,
      totalLOC,
      functionCount: functions.length,
    });
  };

  return mergedVisitor as Visitor;
}

function aggregateComplexity(values: number[], threshold: number): AggregateComplexity {
  if (values.length === 0) {
    return { sum: 0, max: 0, average: 0, countAboveThreshold: 0 };
  }

  let sum = 0;
  let max = 0;
  let countAboveThreshold = 0;
  for (const v of values) {
    sum += v;
    if (v > max) max = v;
    if (v > threshold) countAboveThreshold++;
  }

  return { sum, max, average: sum / values.length, countAboveThreshold };
}
