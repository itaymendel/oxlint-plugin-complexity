import type {
  Visitor,
  ESTreeNode,
  FunctionScope,
  LogicalExpressionNode,
  SwitchCaseNode,
  IfStatementNode,
  ForStatementNode,
  ForInStatementNode,
  ForOfStatementNode,
  WhileStatementNode,
  DoWhileStatementNode,
  CatchClauseNode,
  ConditionalExpressionNode,
  AssignmentExpressionNode,
  ComplexityResult,
} from './types.js';
import { createComplexityVisitor } from './visitor.js';
import { BASE_FUNCTION_COMPLEXITY, LOGICAL_OPERATORS } from './utils.js';

/**
 * Logical assignment operators (short-circuit assignment).
 * Only used by cyclomatic complexity.
 */
const LOGICAL_ASSIGNMENT_OPERATORS = ['||=', '&&=', '??='] as const;

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

    IfStatement(node: IfStatementNode): void {
      addComplexity(node, 'if');
    },

    ForStatement(node: ForStatementNode): void {
      addComplexity(node, 'for');
    },

    ForInStatement(node: ForInStatementNode): void {
      addComplexity(node, 'for...in');
    },

    ForOfStatement(node: ForOfStatementNode): void {
      addComplexity(node, 'for...of');
    },

    WhileStatement(node: WhileStatementNode): void {
      addComplexity(node, 'while');
    },

    DoWhileStatement(node: DoWhileStatementNode): void {
      addComplexity(node, 'do...while');
    },

    CatchClause(node: CatchClauseNode): void {
      addComplexity(node, 'catch');
    },

    ConditionalExpression(node: ConditionalExpressionNode): void {
      addComplexity(node, 'ternary');
    },

    SwitchCase(node: SwitchCaseNode): void {
      // Only count non-default cases (test is null for default case)
      if (node.test !== null) {
        addComplexity(node, 'case');
      }
    },

    LogicalExpression(node: LogicalExpressionNode): void {
      if (LOGICAL_OPERATORS.includes(node.operator as (typeof LOGICAL_OPERATORS)[number])) {
        addComplexity(node, node.operator);
      }
    },

    AssignmentExpression(node: AssignmentExpressionNode): void {
      if (
        LOGICAL_ASSIGNMENT_OPERATORS.includes(
          node.operator as (typeof LOGICAL_ASSIGNMENT_OPERATORS)[number]
        )
      ) {
        addComplexity(node, node.operator);
      }
    },
  } as Visitor;
}
