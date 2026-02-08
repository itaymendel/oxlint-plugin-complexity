import type {
  Visitor,
  ESTreeNode,
  FunctionScope,
  LogicalExpressionNode,
  SwitchCaseNode,
  AssignmentExpressionNode,
  ComplexityResult,
} from './types.js';
import { createComplexityVisitor } from './visitor.js';
import {
  BASE_FUNCTION_COMPLEXITY,
  LOGICAL_OPERATORS,
  LOGICAL_ASSIGNMENT_OPERATORS,
  includes,
} from './utils.js';

/**
 * Calculate cyclomatic complexity for a function body.
 *
 * Formula: 1 + decision_points
 *
 * Decision points:
 * - IfStatement: +1
 * - ForStatement, ForInStatement, ForOfStatement: +1
 * - WhileStatement, DoWhileStatement: +1
 * - SwitchCase (non-default): +1
 * - CatchClause: +1
 * - ConditionalExpression (ternary): +1
 * - LogicalExpression (&&, ||, ??): +1
 * - Logical assignment (&&=, ||=, ??=): +1
 */
export function createCyclomaticVisitor(
  onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void
): Visitor {
  const { context, baseVisitor } = createComplexityVisitor<FunctionScope>({
    createScope: (node, name) => ({
      node,
      name,
      points: [],
    }),

    onComplexityCalculated: (result, node) => {
      onComplexityCalculated(
        { total: result.total + BASE_FUNCTION_COMPLEXITY, points: result.points },
        node
      );
    },
  });

  const { addComplexity } = context;

  return {
    ...baseVisitor,

    IfStatement(node: ESTreeNode): void {
      addComplexity(node, 'if');
    },

    ForStatement(node: ESTreeNode): void {
      addComplexity(node, 'for');
    },

    ForInStatement(node: ESTreeNode): void {
      addComplexity(node, 'for...in');
    },

    ForOfStatement(node: ESTreeNode): void {
      addComplexity(node, 'for...of');
    },

    WhileStatement(node: ESTreeNode): void {
      addComplexity(node, 'while');
    },

    DoWhileStatement(node: ESTreeNode): void {
      addComplexity(node, 'do...while');
    },

    CatchClause(node: ESTreeNode): void {
      addComplexity(node, 'catch');
    },

    ConditionalExpression(node: ESTreeNode): void {
      addComplexity(node, 'ternary');
    },

    SwitchCase(node: SwitchCaseNode): void {
      // Only count non-default cases (test is null for default case)
      if (node.test !== null) {
        addComplexity(node, 'case');
      }
    },

    LogicalExpression(node: LogicalExpressionNode): void {
      if (includes(LOGICAL_OPERATORS, node.operator)) {
        addComplexity(node, node.operator);
      }
    },

    AssignmentExpression(node: AssignmentExpressionNode): void {
      if (includes(LOGICAL_ASSIGNMENT_OPERATORS, node.operator)) {
        addComplexity(node, node.operator);
      }
    },
  } as Visitor;
}
