import type {
  Visitor,
  ESTreeNode,
  FunctionScope,
  ComplexityPoint,
  LogicalExpressionNode,
  SwitchCaseNode,
  SwitchStatementNode,
  IfStatementNode,
  CatchClauseNode,
  AssignmentExpressionNode,
  LabeledJumpStatementNode,
  CallExpressionNode,
  ConditionalExpressionNode,
  MemberExpressionNode,
  Context,
} from './types.js';
import { createComplexityVisitor } from './visitor.js';
import {
  BASE_FUNCTION_COMPLEXITY,
  LOGICAL_OPERATORS,
  LOGICAL_ASSIGNMENT_OPERATORS,
  createComplexityPoint,
  DEFAULT_COMPLEXITY_INCREMENT,
  includes,
  isFunctionNode,
} from './utils.js';
import { isElseIf, isDefaultValuePattern, isJsxShortCircuit } from './cognitive/patterns.js';
import { isRecursiveCall } from './cognitive/recursion.js';

interface CombinedComplexityScope extends FunctionScope {
  nestingLevel: number;
  nestingNodes: Set<ESTreeNode>;
  hasRecursiveCall: boolean;
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
        node,
        name,
        points: [],
        cyclomaticPoints: [],
        cognitivePoints: [],
        nestingLevel: 0,
        nestingNodes: new Set(),
        hasRecursiveCall: false,
      }),

      onEnterFunction(parentScope, node, _scope) {
        // Only add nested function penalty for functions directly inside other functions
        // The penalty is added to the PARENT scope, not the nested function's own scope
        if (parentScope && isFunctionNode(node) && isFunctionNode(parentScope.node)) {
          const functionType =
            node.type === 'ArrowFunctionExpression' ? 'arrow function' : 'function';
          parentScope.cognitivePoints.push(createComplexityPoint(node, `nested ${functionType}`));
        }
      },

      onExitFunction(scope, node) {
        const cyclomatic = scope.cyclomaticPoints.reduce(
          (sum, point) => sum + point.complexity,
          BASE_FUNCTION_COMPLEXITY
        );
        const cognitive = scope.cognitivePoints.reduce((sum, point) => sum + point.complexity, 0);

        onComplexityCalculated(
          {
            cyclomatic,
            cognitive,
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

  function addCyclomatic(node: ESTreeNode, message: string, amount: number = 1): void {
    const scope = getScopeFor(node);
    if (scope) {
      scope.cyclomaticPoints.push(createComplexityPoint(node, message, amount));
    }
  }

  function addCognitive(node: ESTreeNode, message: string): void {
    const scope = getScopeFor(node);
    if (scope) {
      scope.cognitivePoints.push(createComplexityPoint(node, message));
    }
  }

  function addStructuralCognitive(node: ESTreeNode, message: string): void {
    const scope = getScopeFor(node);
    if (scope) {
      scope.cognitivePoints.push(
        createComplexityPoint(node, message, DEFAULT_COMPLEXITY_INCREMENT, scope.nestingLevel)
      );
    }
  }

  function addNestingNode(node: ESTreeNode): void {
    const scope = getScopeFor(node);
    if (scope) {
      scope.nestingNodes.add(node);
    }
  }

  function handleNestingEnter(node: ESTreeNode): void {
    const scope = getScopeFor(node);
    if (!scope?.nestingNodes.has(node)) return;
    scope.nestingLevel++;
  }

  function handleNestingExit(node: ESTreeNode): void {
    const scope = getScopeFor(node);
    if (!scope?.nestingNodes.has(node)) return;
    scope.nestingLevel--;
    scope.nestingNodes.delete(node);
  }

  function handleIfStatement(node: IfStatementNode): void {
    addCyclomatic(node, 'if');

    if (isElseIf(node)) {
      addCognitive(node, 'else if');
    } else {
      addStructuralCognitive(node, 'if');
    }
    addNestingNode(node.consequent);

    if (node.alternate && node.alternate.type !== 'IfStatement') {
      addNestingNode(node.alternate);
      addCognitive(node, 'else');
    }
  }

  function handleLogicalExpression(node: LogicalExpressionNode): void {
    if (!getScopeFor(node)) return;

    const operator = node.operator;
    if (!includes(LOGICAL_OPERATORS, operator)) return;

    // Cyclomatic: always count logical operators
    addCyclomatic(node, operator);

    // Cognitive: skip default value patterns and JSX short-circuit
    if (isDefaultValuePattern(node, context) || isJsxShortCircuit(node)) {
      return;
    }

    // Cognitive: only count if NOT a continuation of the same operator
    // (e.g., a && b && c counts as +1, not +3)
    const parent = node.parent as LogicalExpressionNode | undefined;
    const isContinuationOfSameOperator =
      parent?.type === 'LogicalExpression' && parent.operator === operator;

    if (!isContinuationOfSameOperator) {
      addCognitive(node, `logical operator '${operator}'`);
    }
  }

  function handleLabeledJump(node: ESTreeNode, keyword: string): void {
    const stmt = node as LabeledJumpStatementNode;
    if (stmt.label) {
      addCognitive(node, `${keyword} to label '${stmt.label.name}'`);
    }
  }

  // Nesting nodes are always children, so the '*:exit' handler alone unwinds them.
  const createLoopHandler = (label: string) => (node: ESTreeNode) => {
    addCyclomatic(node, label);
    addStructuralCognitive(node, label);
    addNestingNode((node as { body: ESTreeNode }).body);
  };

  return {
    ...baseVisitor,

    // Wildcard handlers to track nesting level for all nodes
    '*'(node: ESTreeNode) {
      handleNestingEnter(node);
    },
    '*:exit'(node: ESTreeNode) {
      handleNestingExit(node);
    },

    IfStatement(node: ESTreeNode) {
      handleIfStatement(node as IfStatementNode);
    },

    ForStatement: createLoopHandler('for'),
    ForInStatement: createLoopHandler('for-in'),
    ForOfStatement: createLoopHandler('for-of'),
    WhileStatement: createLoopHandler('while'),
    DoWhileStatement: createLoopHandler('do-while'),

    SwitchCase(node: ESTreeNode) {
      const switchCase = node as SwitchCaseNode;
      if (switchCase.test !== null) {
        addCyclomatic(node, 'case');
      }
    },
    SwitchStatement(node: ESTreeNode) {
      addStructuralCognitive(node, 'switch');
      for (const switchCase of (node as SwitchStatementNode).cases) {
        addNestingNode(switchCase as ESTreeNode);
      }
    },

    CatchClause(node: ESTreeNode) {
      addCyclomatic(node, 'catch');
      addStructuralCognitive(node, 'catch');
      addNestingNode((node as CatchClauseNode).body);
    },

    ConditionalExpression(node: ESTreeNode) {
      const ternary = node as ConditionalExpressionNode;
      addCyclomatic(node, 'ternary');
      addStructuralCognitive(node, 'ternary operator');
      // Add nesting for both branches to properly track nested ternaries
      addNestingNode(ternary.consequent as ESTreeNode);
      addNestingNode(ternary.alternate as ESTreeNode);
    },

    LogicalExpression(node: ESTreeNode) {
      handleLogicalExpression(node as LogicalExpressionNode);
    },

    AssignmentExpression(node: ESTreeNode) {
      const assignment = node as AssignmentExpressionNode;
      if (includes(LOGICAL_ASSIGNMENT_OPERATORS, assignment.operator)) {
        addCyclomatic(node, assignment.operator);
      }
    },
    AssignmentPattern(node: ESTreeNode) {
      addCyclomatic(node, 'default value');
    },

    MemberExpression(node: ESTreeNode) {
      if ((node as MemberExpressionNode).optional) {
        addCyclomatic(node, '?.');
      }
    },

    BreakStatement(node: ESTreeNode) {
      handleLabeledJump(node, 'break');
    },
    ContinueStatement(node: ESTreeNode) {
      handleLabeledJump(node, 'continue');
    },

    CallExpression(node: ESTreeNode) {
      const call = node as CallExpressionNode;
      if (call.optional) {
        addCyclomatic(node, '?.()');
      }

      const scope = getScopeFor(node);
      if (!scope?.name || !isFunctionNode(scope.node)) return;

      if (!scope.hasRecursiveCall && isRecursiveCall(call, scope.name)) {
        scope.hasRecursiveCall = true;
        addCognitive(node, 'recursive call');
      }
    },
  } as Visitor;
}
