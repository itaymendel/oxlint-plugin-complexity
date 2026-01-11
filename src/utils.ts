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

export function formatBreakdown(points: ComplexityPoint[]): string {
  if (points.length === 0) return '';

  const sorted = points.toSorted((a, b) => a.location.start.line - b.location.start.line);
  const maxComplexity = Math.max(...sorted.map((p) => p.complexity));

  const lines = sorted.map((point) => {
    const constructMatch = point.message.match(/:\s*(.+)$/);
    const construct = constructMatch ? constructMatch[1].trim() : 'unknown';

    const nestingMatch = point.message.match(/\(incl\.\s*(\d+)\s*for nesting\)/);
    const nestingInfo = nestingMatch ? ` (incl. +${nestingMatch[1]} nesting)` : '';

    const isTopOffender = point.complexity === maxComplexity;

    const prefix = isTopOffender ? '>>>' : '   ';
    const suffix = isTopOffender ? ' [top offender]' : '';

    return `${prefix} Line ${point.location.start.line}: +${point.complexity} for '${construct}'${nestingInfo}${suffix}`;
  });

  return '\n\nBreakdown:\n' + lines.join('\n');
}
