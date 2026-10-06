import type {
  Visitor,
  ESTreeNode,
  ComplexityPoint,
  LogicalExpressionNode,
  SwitchCaseNode,
  AssignmentExpressionNode,
  CallExpressionNode,
  MemberExpressionNode,
  Context,
} from './types.js';
import { createComplexityVisitor } from './visitor.js';
import {
  BASE_FUNCTION_COMPLEXITY,
  LOGICAL_OPERATORS,
  LOGICAL_ASSIGNMENT_OPERATORS,
  createComplexityPoint,
  includes,
} from './utils.js';
import {
  createCognitiveHandlers,
  createCognitiveScope,
  type CognitiveFunctionScope,
} from './cognitive/handlers.js';

interface CombinedComplexityScope extends CognitiveFunctionScope {
  cyclomaticPoints: ComplexityPoint[];
  cognitivePoints: ComplexityPoint[];
}

export interface CombinedComplexityResult {
  cyclomatic: number;
  cognitive: number;
  cyclomaticPoints: ComplexityPoint[];
  cognitivePoints: ComplexityPoint[];
}

/**
 * Create a combined visitor that calculates both cyclomatic and cognitive complexity
 * in a single AST walk.
 */
// eslint-disable-next-line complexity/complexity -- Visitor factory pattern requires many nested handlers
export function createCombinedComplexityVisitor(
  context: Context,
  onComplexityCalculated: (result: CombinedComplexityResult, node: ESTreeNode) => void
): Visitor {
  const { context: visitorContext, baseVisitor } = createComplexityVisitor<CombinedComplexityScope>(
    {
      createScope: (node, name) => ({
        ...createCognitiveScope(node, name),
        cyclomaticPoints: [],
        cognitivePoints: [],
      }),

      onEnterFunction(parentScope, node) {
        cognitive.onEnterFunction(parentScope, node);
      },

      onExitFunction(scope, node) {
        cognitive.onExitFunction(scope, node);
        const cyclomatic = scope.cyclomaticPoints.reduce(
          (sum, point) => sum + point.complexity,
          BASE_FUNCTION_COMPLEXITY
        );
        const cognitiveTotal = scope.cognitivePoints.reduce(
          (sum, point) => sum + point.complexity,
          0
        );

        onComplexityCalculated(
          {
            cyclomatic,
            cognitive: cognitiveTotal,
            cyclomaticPoints: scope.cyclomaticPoints,
            cognitivePoints: scope.cognitivePoints,
          },
          node
        );
      },

      // Required by the base visitor interface; actual reporting is in onExitFunction
      onComplexityCalculated() {},
    }
  );

  const { getScopeFor } = visitorContext;
  const cognitive = createCognitiveHandlers(context, {
    getScopeFor,
    getPoints: (scope) => scope.cognitivePoints,
    pointFormat: 'combined',
  });

  function addCyclomatic(node: ESTreeNode, message: string): void {
    const scope = getScopeFor(node);
    if (scope) {
      scope.cyclomaticPoints.push(createComplexityPoint(node, message));
    }
  }

  // Both metrics must receive overlapping events; spreading handlers alone would overwrite one.
  function withCyclomatic<T extends ESTreeNode>(handler: (node: T) => void, message: string) {
    return (node: T): void => {
      addCyclomatic(node, message);
      handler(node);
    };
  }

  return {
    ...baseVisitor,
    ...cognitive.visitor,

    IfStatement: withCyclomatic(cognitive.visitor.IfStatement, 'if'),
    ForStatement: withCyclomatic(cognitive.visitor.ForStatement, 'for'),
    ForInStatement: withCyclomatic(cognitive.visitor.ForInStatement, 'for-in'),
    ForOfStatement: withCyclomatic(cognitive.visitor.ForOfStatement, 'for-of'),
    WhileStatement: withCyclomatic(cognitive.visitor.WhileStatement, 'while'),
    DoWhileStatement: withCyclomatic(cognitive.visitor.DoWhileStatement, 'do-while'),
    CatchClause: withCyclomatic(cognitive.visitor.CatchClause, 'catch'),
    ConditionalExpression: withCyclomatic(cognitive.visitor.ConditionalExpression, 'ternary'),

    SwitchCase(node: SwitchCaseNode) {
      if (node.test !== null) {
        addCyclomatic(node, 'case');
      }
    },

    LogicalExpression(node: LogicalExpressionNode) {
      if (includes(LOGICAL_OPERATORS, node.operator)) {
        addCyclomatic(node, node.operator);
      }
      cognitive.visitor.LogicalExpression(node);
    },

    AssignmentExpression(node: AssignmentExpressionNode) {
      if (includes(LOGICAL_ASSIGNMENT_OPERATORS, node.operator)) {
        addCyclomatic(node, node.operator);
      }
    },
    AssignmentPattern(node: ESTreeNode) {
      addCyclomatic(node, 'default value');
    },

    MemberExpression(node: MemberExpressionNode) {
      if (node.optional) {
        addCyclomatic(node, '?.');
      }
    },

    CallExpression(node: CallExpressionNode) {
      if (node.optional) {
        addCyclomatic(node, '?.()');
      }
      cognitive.visitor.CallExpression(node);
    },
  } as Visitor;
}
