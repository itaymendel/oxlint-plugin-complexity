import type { ESTreeNode, FunctionNode, ComplexityPoint } from './types.js';

/** Cyclomatic complexity formula starts at 1 (1 + decision_points). */
export const BASE_FUNCTION_COMPLEXITY = 1;

export const DEFAULT_COMPLEXITY_INCREMENT = 1;

export const LOGICAL_OPERATORS = ['&&', '||', '??'] as const;

const DEFAULT_LOCATION = {
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
} as const;

export function createComplexityPoint(
  node: ESTreeNode,
  message: string,
  amount: number = DEFAULT_COMPLEXITY_INCREMENT,
  nestingLevel: number = 0
): ComplexityPoint {
  const complexity = amount + nestingLevel;
  const displayMessage =
    nestingLevel > 0
      ? `+${complexity} (incl. ${nestingLevel} for nesting): ${message}`
      : `+${amount}: ${message}`;

  return {
    complexity,
    location: node.loc ?? DEFAULT_LOCATION,
    message: displayMessage,
  };
}

function getNameFromId(node: FunctionNode): string | null {
  if ('id' in node && node.id && 'name' in node.id) {
    return String(node.id.name);
  }
  return null;
}

function getNameFromKey(node: FunctionNode): string | null {
  if ('key' in node && node.key && 'name' in node.key) {
    return String(node.key.name);
  }
  return null;
}

function getNameFromVariableDeclarator(parent?: ESTreeNode): string | null {
  if (parent?.type !== 'VariableDeclarator') return null;
  if ('id' in parent && parent.id && 'name' in parent.id) {
    return String(parent.id.name);
  }
  return null;
}

function getNameFromProperty(parent?: ESTreeNode): string | null {
  if (parent?.type !== 'Property') return null;
  if ('key' in parent && parent.key && 'name' in parent.key) {
    return String(parent.key.name);
  }
  return null;
}

function getNameFromAssignment(parent?: ESTreeNode): string | null {
  if (parent?.type !== 'AssignmentExpression') return null;
  if ('left' in parent && parent.left && 'name' in parent.left) {
    return String(parent.left.name);
  }
  return null;
}

function getNameFromMethodDefinition(parent?: ESTreeNode): string | null {
  if (parent?.type !== 'MethodDefinition') return null;
  if ('key' in parent && parent.key && 'name' in parent.key) {
    return String(parent.key.name);
  }
  if ('kind' in parent && parent.kind === 'constructor') {
    return 'constructor';
  }
  return null;
}

function getNameFromPropertyDefinition(parent?: ESTreeNode): string | null {
  if (parent?.type !== 'PropertyDefinition') return null;
  if ('key' in parent && parent.key && 'name' in parent.key) {
    return String(parent.key.name);
  }
  return null;
}

export function getFunctionName(node: FunctionNode, parent?: ESTreeNode): string {
  const fromNode = getNameFromId(node) ?? getNameFromKey(node);
  if (fromNode) return fromNode;

  const fromParent =
    getNameFromVariableDeclarator(parent) ??
    getNameFromProperty(parent) ??
    getNameFromAssignment(parent) ??
    getNameFromMethodDefinition(parent) ??
    getNameFromPropertyDefinition(parent);
  if (fromParent) return fromParent;

  return node.type === 'ArrowFunctionExpression' ? '<arrow>' : '<anonymous>';
}

export function summarizeComplexity(
  points: ComplexityPoint[],
  normalizeCategory?: (category: string) => string
): string {
  const categories: Record<string, number> = {};

  for (const point of points) {
    const match = point.message.match(/:\s*(.+)$/);
    if (match) {
      let category = match[1].trim();
      if (normalizeCategory) {
        category = normalizeCategory(category);
      }
      categories[category] = (categories[category] || 0) + point.complexity;
    }
  }

  const sorted = Object.entries(categories)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sorted.length === 0) return '';

  return ' [' + sorted.map(([cat, count]) => `${cat}: +${count}`).join(', ') + ']';
}

const DEFAULT_NESTING_TIP_THRESHOLD = 3;
const DEFAULT_ELSE_IF_CHAIN_THRESHOLD = 4;
const DEFAULT_LOGICAL_OPERATOR_THRESHOLD = 3;

const NESTING_TIP =
  '    ↳ Tip: Extract inner loops into helper functions - each extraction removes one nesting level';

export interface BreakdownOptions {
  /** Minimum nesting level to show extraction tip (default: 3, set to 0 to disable) */
  nestingTipThreshold?: number;
  /** Minimum else-if count to show chain tip (default: 4, set to 0 to disable) */
  elseIfChainThreshold?: number;
  /** Minimum logical operator sequences to show tip (default: 3, set to 0 to disable) */
  logicalOperatorThreshold?: number;
}

interface PatternCounts {
  elseIfCount: number;
  logicalOperatorCount: number;
}

function countPatterns(points: ComplexityPoint[]): PatternCounts {
  let elseIfCount = 0;
  let logicalOperatorCount = 0;

  for (const point of points) {
    const construct = point.message.match(/:\s*(.+)$/)?.[1]?.trim() ?? '';

    if (construct === 'else if') {
      elseIfCount++;
    } else if (construct.startsWith('logical operator')) {
      logicalOperatorCount++;
    }
  }

  return { elseIfCount, logicalOperatorCount };
}

function generatePatternTips(counts: PatternCounts, options: BreakdownOptions): string[] {
  const tips: string[] = [];

  const elseIfThreshold = options.elseIfChainThreshold ?? DEFAULT_ELSE_IF_CHAIN_THRESHOLD;
  const logicalThreshold = options.logicalOperatorThreshold ?? DEFAULT_LOGICAL_OPERATOR_THRESHOLD;

  if (elseIfThreshold > 0 && counts.elseIfCount >= elseIfThreshold) {
    tips.push(
      `Long else-if chain (${counts.elseIfCount} branches). Consider using a lookup object or switch statement.`
    );
  }

  if (logicalThreshold > 0 && counts.logicalOperatorCount >= logicalThreshold) {
    tips.push(
      `Complex boolean logic (${counts.logicalOperatorCount} operator sequences). Consider extracting into named boolean variables.`
    );
  }

  return tips;
}

export function formatBreakdown(points: ComplexityPoint[], options?: BreakdownOptions): string {
  if (points.length === 0) return '';

  const opts = options ?? {};
  const nestingTipThreshold = opts.nestingTipThreshold ?? DEFAULT_NESTING_TIP_THRESHOLD;
  const sorted = points.toSorted((a, b) => a.location.start.line - b.location.start.line);
  const maxComplexity = Math.max(...sorted.map((p) => p.complexity));

  const lines = sorted.map((point) => {
    const constructMatch = point.message.match(/:\s*(.+)$/);
    const construct = constructMatch ? constructMatch[1].trim() : 'unknown';

    const nestingMatch = point.message.match(/\(incl\.\s*(\d+)\s*for nesting\)/);
    const nestingLevel = nestingMatch ? parseInt(nestingMatch[1], 10) : 0;
    const nestingInfo = nestingLevel > 0 ? ` (incl. +${nestingLevel} nesting)` : '';

    const isTopOffender = point.complexity === maxComplexity;

    const prefix = isTopOffender ? '>>>' : '   ';
    const suffix = isTopOffender ? ' [top offender]' : '';

    const line = `${prefix} Line ${point.location.start.line}: +${point.complexity} for '${construct}'${nestingInfo}${suffix}`;

    if (isTopOffender && nestingTipThreshold > 0 && nestingLevel >= nestingTipThreshold) {
      return `${line}\n${NESTING_TIP}`;
    }

    return line;
  });

  let result = '\n\nBreakdown:\n' + lines.join('\n');

  // Add pattern-based tips at the end
  const patternCounts = countPatterns(points);
  const patternTips = generatePatternTips(patternCounts, opts);

  if (patternTips.length > 0) {
    result += '\n\nTips:\n' + patternTips.map((tip) => `  • ${tip}`).join('\n');
  }

  return result;
}
