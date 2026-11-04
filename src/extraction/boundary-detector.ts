import type { ComplexityPoint, ESTreeNode } from '../types.js';
import type { ExtractionOptions, ExtractionSuggestion, VariableFlowAnalysis } from './types.js';
import type { AstUnit, UnitCandidate } from './unit-finder.js';
import { extractConstructFromMessage } from '../utils.js';
import { findUnits, indexPoints, pointsInUnit } from './unit-finder.js';

const DEFAULT_MIN_COMPLEXITY_PERCENTAGE = 30;
const DEFAULT_MAX_COMPLEXITY_PERCENTAGE = 70; // Reject candidates covering too much of the function
const DEFAULT_MAX_CANDIDATES = 3;

/** When two units cover the same lines, the statement is the more natural description. */
const KIND_PRIORITY = { statement: 0, body: 1, case: 2 } as const;

/** Strip surrounding quotes from construct names like "'if'" */
function extractConstruct(message: string): string {
  return extractConstructFromMessage(message).replace(/^'|'$/g, '');
}

function getUniqueConstructs(points: ComplexityPoint[]): string[] {
  const constructs = new Set<string>();
  for (const point of points) {
    constructs.add(extractConstruct(point.message));
  }
  return Array.from(constructs);
}

function candidatesOverlap(a: UnitCandidate, b: UnitCandidate): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

type FoundCandidate = UnitCandidate & { unit: AstUnit };

function toCandidate(
  unit: AstUnit,
  points: ComplexityPoint[],
  complexity: number,
  complexityPercentage: number
): FoundCandidate {
  return {
    startLine: unit.start.line,
    endLine: unit.end.line,
    complexity,
    complexityPercentage,
    points,
    constructs: getUniqueConstructs(points),
    unit,
  };
}

function keepPreferred(
  existing: FoundCandidate | undefined,
  candidate: FoundCandidate
): FoundCandidate {
  if (!existing) return candidate;
  return KIND_PRIORITY[candidate.unit.kind] < KIND_PRIORITY[existing.unit.kind]
    ? candidate
    : existing;
}

/**
 * All AST units of the function whose share of the total complexity is inside the
 * configured window, one per distinct line range. Selection happens later, after flow analysis.
 */
export function findExtractionCandidates(
  functionNode: ESTreeNode,
  points: ComplexityPoint[],
  totalComplexity: number,
  options?: ExtractionOptions
): UnitCandidate[] {
  const opts = options ?? {};
  const minPercentage = opts.minComplexityPercentage ?? DEFAULT_MIN_COMPLEXITY_PERCENTAGE;
  const maxPercentage = opts.maxComplexityPercentage ?? DEFAULT_MAX_COMPLEXITY_PERCENTAGE;

  if (points.length === 0 || totalComplexity === 0) {
    return [];
  }

  const index = indexPoints(points);
  const byRange = new Map<string, FoundCandidate>();

  for (const unit of findUnits(functionNode)) {
    const inUnit = pointsInUnit(index, unit);
    if (inUnit.complexity === 0) continue;
    const percentage = Math.round((inUnit.complexity / totalComplexity) * 100);
    if (percentage < minPercentage || percentage > maxPercentage) continue;
    const candidate = toCandidate(unit, inUnit.points, inUnit.complexity, percentage);
    const key = `${candidate.startLine}-${candidate.endLine}`;
    byRange.set(key, keepPreferred(byRange.get(key), candidate));
  }

  return [...byRange.values()];
}

interface RankedCandidate {
  candidate: UnitCandidate;
  flow: VariableFlowAnalysis;
  suggestion: ExtractionSuggestion;
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;

function isStrictlyInside(inner: UnitCandidate, outer: UnitCandidate): boolean {
  const sameRange = inner.startLine === outer.startLine && inner.endLine === outer.endLine;
  return !sameRange && inner.startLine >= outer.startLine && inner.endLine <= outer.endLine;
}

/** A unit is dominated when a unit strictly inside it is more confidently extractable. */
function isDominated(entry: RankedCandidate, all: RankedCandidate[]): boolean {
  return all.some(
    (other) =>
      isStrictlyInside(other.candidate, entry.candidate) &&
      CONFIDENCE_RANK[other.suggestion.confidence] > CONFIDENCE_RANK[entry.suggestion.confidence]
  );
}

function exitCount(entry: RankedCandidate): number {
  return entry.flow.earlyExits?.length ?? 0;
}

/** Replaceable exits (`return extracted(...)`) are the more mechanical refactor. */
function hasNonReplaceableExit(entry: RankedCandidate): number {
  return entry.flow.earlyExits?.some((exit) => !exit.replaceable) ? 1 : 0;
}

function span(entry: RankedCandidate): number {
  return entry.candidate.endLine - entry.candidate.startLine;
}

const TIE_BREAKERS: Array<(a: RankedCandidate, b: RankedCandidate) => number> = [
  (a, b) => b.candidate.complexity - a.candidate.complexity,
  (a, b) => exitCount(a) - exitCount(b),
  (a, b) => hasNonReplaceableExit(a) - hasNonReplaceableExit(b),
  (a, b) =>
    Number(b.candidate.unit?.compound ?? false) - Number(a.candidate.unit?.compound ?? false),
  (a, b) => a.flow.inputs.length - b.flow.inputs.length,
  (a, b) => a.flow.outputs.length - b.flow.outputs.length,
  (a, b) => span(a) - span(b),
  (a, b) => a.candidate.startLine - b.candidate.startLine,
];

function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  for (const compare of TIE_BREAKERS) {
    const result = compare(a, b);
    if (result !== 0) return result;
  }
  return 0;
}

/**
 * Pick up to `maxCandidates` non-overlapping suggestions: drop units dominated by a better nested
 * unit, then greedily take the highest-complexity ones. Returned in source order.
 */
export function selectBest(
  entries: RankedCandidate[],
  options?: ExtractionOptions
): ExtractionSuggestion[] {
  const maxCandidates = options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const sorted = entries.filter((entry) => !isDominated(entry, entries)).toSorted(compareRanked);
  const selected: RankedCandidate[] = [];

  for (const entry of sorted) {
    if (selected.length >= maxCandidates) break;
    if (!selected.some((s) => candidatesOverlap(s.candidate, entry.candidate))) {
      selected.push(entry);
    }
  }

  return selected
    .toSorted((a, b) => a.candidate.startLine - b.candidate.startLine)
    .map((entry) => entry.suggestion);
}
