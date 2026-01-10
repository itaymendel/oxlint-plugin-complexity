import type { ESTreeNode, FunctionNode, ComplexityPoint } from './types.js';

/**
 * Base complexity for any function.
 * Cyclomatic: McCabe's formula starts at 1 (1 + decision_points)
 * Cognitive: Each function starts with 0, but this is used for structural increments
 */
export const BASE_FUNCTION_COMPLEXITY = 1;

/**
 * Default increment for each complexity-adding construct.
 * Used as the base increment before nesting penalties are applied.
 */
export const DEFAULT_COMPLEXITY_INCREMENT = 1;

/**
 * Logical operators that create decision points.
 * Used by both cyclomatic and cognitive complexity.
 */
export const LOGICAL_OPERATORS = ['&&', '||', '??'] as const;

/**
 * Default location used when a node has no location information.
 * This prevents null checks throughout the codebase.
 */
export const DEFAULT_LOCATION = {
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
} as const;

/**
 * Create a complexity point for tracking where complexity is added.
 * Used by both cyclomatic and cognitive complexity calculations.
 *
 * @param node - The AST node contributing to complexity
 * @param message - Description of why this adds complexity (e.g., "if", "for...of")
 * @param amount - How much complexity to add (default: 1)
 * @param nestingLevel - Current nesting level to add as penalty (default: 0, used by cognitive complexity)
 * @returns A ComplexityPoint object
 */
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

/**
 * Get the name of a function from its AST node.
 * Uses type narrowing with string coercion for ESTree compatibility.
 */
export function getFunctionName(node: FunctionNode, parent?: ESTreeNode): string {
  // Try extracting from the node itself first
  const fromNode = getNameFromId(node) ?? getNameFromKey(node);
  if (fromNode) return fromNode;

  // Try extracting from parent context
  const fromParent =
    getNameFromVariableDeclarator(parent) ??
    getNameFromProperty(parent) ??
    getNameFromAssignment(parent) ??
    getNameFromMethodDefinition(parent) ??
    getNameFromPropertyDefinition(parent);
  if (fromParent) return fromParent;

  return node.type === 'ArrowFunctionExpression' ? '<arrow>' : '<anonymous>';
}

/**
 * Summarize complexity points into categories for better error messages.
 * Returns a bracketed summary of top contributors, e.g., " [if: +3, for: +2]"
 *
 * @param points - Array of complexity points to summarize
 * @param normalizeCategory - Optional function to normalize category names
 * @returns Formatted summary string, or empty string if no points
 */
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

/**
 * Format a detailed line-by-line breakdown of complexity points.
 * Shows each contributor sorted by line number, with top offender(s) highlighted.
 *
 * @param points - Array of complexity points to format
 * @returns Formatted breakdown string, or empty string if no points
 */
export function formatBreakdown(points: ComplexityPoint[]): string {
  if (points.length === 0) return '';

  const sorted = points.toSorted((a, b) => a.location.start.line - b.location.start.line);

  const maxComplexity = Math.max(...sorted.map((p) => p.complexity));

  const lines = sorted.map((point) => {
    const line = point.location.start.line;

    const constructMatch = point.message.match(/:\s*(.+)$/);
    const construct = constructMatch ? constructMatch[1].trim() : 'unknown';

    // Extract nesting info if present
    const nestingMatch = point.message.match(/\(incl\.\s*(\d+)\s*for nesting\)/);
    const nestingInfo = nestingMatch ? ` (incl. +${nestingMatch[1]} nesting)` : '';

    const isTopOffender = point.complexity === maxComplexity;
    const prefix = isTopOffender ? '>>>' : '   ';
    const suffix = isTopOffender ? ' [top offender]' : '';

    return `${prefix} Line ${line}: +${point.complexity} for '${construct}'${nestingInfo}${suffix}`;
  });

  return '\n\nBreakdown:\n' + lines.join('\n');
}
