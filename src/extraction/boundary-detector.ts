import type { ComplexityPoint } from '../types.js';
import type { ExtractionCandidate, ExtractionOptions } from './types.js';

const DEFAULT_MIN_COMPLEXITY_PERCENTAGE = 30;
const DEFAULT_MAX_COMPLEXITY_PERCENTAGE = 70; // Reject candidates covering too much of the function
const DEFAULT_MAX_LINE_GAP = 2;
const DEFAULT_MAX_CANDIDATES = 3;

/**
 * Extract the construct type from a complexity point message.
 * Messages are in format: "+N: construct" or "+N (incl. M for nesting): construct"
 */
function extractConstruct(message: string): string {
  const match = message.match(/:\s*(.+)$/);
  if (match) {
    const construct = match[1].trim();
    // Remove quotes from constructs like "'if'"
    return construct.replace(/^'|'$/g, '');
  }
  return 'unknown';
}

function getUniqueConstructs(points: ComplexityPoint[]): string[] {
  const constructs = new Set<string>();
  for (const point of points) {
    constructs.add(extractConstruct(point.message));
  }
  return Array.from(constructs);
}

interface PointGroup {
  points: ComplexityPoint[];
  startLine: number;
  endLine: number;
  totalComplexity: number;
}

function groupAdjacentPoints(points: ComplexityPoint[], maxLineGap: number): PointGroup[] {
  if (points.length === 0) return [];

  const sorted = points.toSorted((a, b) => a.location.start.line - b.location.start.line);

  const groups: PointGroup[] = [];
  let currentGroup: PointGroup = {
    points: [sorted[0]],
    startLine: sorted[0].location.start.line,
    endLine: sorted[0].location.start.line,
    totalComplexity: sorted[0].complexity,
  };

  for (let i = 1; i < sorted.length; i++) {
    const point = sorted[i];
    const pointStartLine = point.location.start.line;

    if (pointStartLine <= currentGroup.endLine + maxLineGap) {
      currentGroup.points.push(point);
      currentGroup.endLine = pointStartLine;
      currentGroup.totalComplexity += point.complexity;
    } else {
      groups.push(currentGroup);
      currentGroup = {
        points: [point],
        startLine: pointStartLine,
        endLine: pointStartLine,
        totalComplexity: point.complexity,
      };
    }
  }

  groups.push(currentGroup);
  return groups;
}

function groupToCandidate(group: PointGroup, totalComplexity: number): ExtractionCandidate {
  const lastPoint = group.points[group.points.length - 1];
  const actualEndLine = lastPoint.location.end.line;

  return {
    startLine: group.startLine,
    endLine: actualEndLine,
    complexity: group.totalComplexity,
    complexityPercentage: Math.round((group.totalComplexity / totalComplexity) * 100),
    points: group.points,
    constructs: getUniqueConstructs(group.points),
  };
}

function candidatesOverlap(a: ExtractionCandidate, b: ExtractionCandidate): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function selectNonOverlapping(
  candidates: ExtractionCandidate[],
  maxCandidates: number
): ExtractionCandidate[] {
  const sorted = candidates.toSorted((a, b) => b.complexity - a.complexity);
  const selected: ExtractionCandidate[] = [];

  for (const candidate of sorted) {
    if (selected.length >= maxCandidates) break;

    const overlaps = selected.some((s) => candidatesOverlap(s, candidate));
    if (!overlaps) {
      selected.push(candidate);
    }
  }

  return selected.toSorted((a, b) => a.startLine - b.startLine);
}

export function findExtractionCandidates(
  points: ComplexityPoint[],
  totalComplexity: number,
  options?: ExtractionOptions
): ExtractionCandidate[] {
  const minPercentage = options?.minComplexityPercentage ?? DEFAULT_MIN_COMPLEXITY_PERCENTAGE;
  const maxPercentage = options?.maxComplexityPercentage ?? DEFAULT_MAX_COMPLEXITY_PERCENTAGE;
  const maxLineGap = options?.maxLineGap ?? DEFAULT_MAX_LINE_GAP;
  const maxCandidates = options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  if (points.length === 0 || totalComplexity === 0) {
    return [];
  }

  const groups = groupAdjacentPoints(points, maxLineGap);

  const candidates = groups
    .map((group) => groupToCandidate(group, totalComplexity))
    .filter(
      (candidate) =>
        candidate.complexityPercentage >= minPercentage &&
        candidate.complexityPercentage <= maxPercentage
    );

  return selectNonOverlapping(candidates, maxCandidates);
}
