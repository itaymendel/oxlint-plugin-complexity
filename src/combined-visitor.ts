import type {
  Visitor,
  ESTreeNode,
  FunctionScope,
  ComplexityPoint,
  LogicalExpressionNode,
  SwitchCaseNode,
  IfStatementNode,
  CatchClauseNode,
  AssignmentExpressionNode,
  LabeledJumpStatementNode,
  CallExpressionNode,
  ConditionalExpressionNode,
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
// eslint-disable-next-line complexity/max-cognitive -- Visitor factory pattern requires many nested handlers
export function createCombinedComplexityVisitor(
  context: Context,
  onComplexityCalculated: (result: CombinedComplexityResult, node: ESTreeNode) => void
): Visitor {
  let globalFunctionNestingLevel = 0;

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
        // Only add nested function penalty for functions inside other functions
        // (not for top-level arrow functions or callbacks)
        // The penalty is added to the PARENT scope, not the nested function's own scope
        if (parentScope && globalFunctionNestingLevel > 0) {
          const functionType =
            node.type === 'ArrowFunctionExpression' ? 'arrow function' : 'function';
          parentScope.cognitivePoints.push(createComplexityPoint(node, `nested ${functionType}`));
        }
        globalFunctionNestingLevel++;
      },

      onExitFunction(scope, node) {
        globalFunctionNestingLevel--;

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

  const { getCurrentScope } = visitorContext;

  function addCyclomatic(node: ESTreeNode, message: string, amount: number = 1): void {
    const scope = getCurrentScope();
    if (scope) {
      scope.cyclomaticPoints.push(createComplexityPoint(node, message, amount));
    }
  }

  function addCognitive(node: ESTreeNode, message: string): void {
    const scope = getCurrentScope();
    if (scope) {
      scope.cognitivePoints.push(createComplexityPoint(node, message));
    }
  }

  function addStructuralCognitive(node: ESTreeNode, message: string): void {
    const scope = getCurrentScope();
    if (scope) {
      scope.cognitivePoints.push(
        createComplexityPoint(node, message, DEFAULT_COMPLEXITY_INCREMENT, scope.nestingLevel)
      );
    }
  }

  function addNestingNode(node: ESTreeNode): void {
    const scope = getCurrentScope();
    if (scope) {
      scope.nestingNodes.add(node);
    }
  }

  function handleNestingEnter(node: ESTreeNode): void {
    const scope = getCurrentScope();
    if (!scope?.nestingNodes.has(node)) return;
    scope.nestingLevel++;
  }

  function handleNestingExit(node: ESTreeNode): void {
    const scope = getCurrentScope();
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
      addNestingNode(node.consequent);
    }
  }

  function handleLogicalExpression(node: LogicalExpressionNode): void {
    if (!getCurrentScope()) return;

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

  // Loop handler factory: all loop types follow the same enter/exit pattern
  function createLoopHandlers(label: string): {
    enter: (node: ESTreeNode) => void;
    exit: (node: ESTreeNode) => void;
  } {
    return {
      enter(node: ESTreeNode) {
        addCyclomatic(node, label);
        addStructuralCognitive(node, label);
        addNestingNode((node as { body: ESTreeNode }).body);
      },
      exit(node: ESTreeNode) {
        handleNestingExit((node as { body: ESTreeNode }).body);
      },
    };
  }

  const forLoop = createLoopHandlers('for');
  const forInLoop = createLoopHandlers('for-in');
  const forOfLoop = createLoopHandlers('for-of');
  const whileLoop = createLoopHandlers('while');
  const doWhileLoop = createLoopHandlers('do-while');

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
    'IfStatement:exit'(node: ESTreeNode) {
      const ifNode = node as IfStatementNode;
      handleNestingExit(ifNode.consequent);

      // Add 'else' complexity only for plain else blocks, not else-if chains
      if (ifNode.alternate && ifNode.alternate.type !== 'IfStatement') {
        addCognitive(node, 'else');
        addNestingNode(ifNode.alternate);
      }
    },
    'IfStatement > .alternate:exit'(node: ESTreeNode) {
      handleNestingExit(node);
    },

    ForStatement: forLoop.enter,
    'ForStatement:exit': forLoop.exit,
    ForInStatement: forInLoop.enter,
    'ForInStatement:exit': forInLoop.exit,
    ForOfStatement: forOfLoop.enter,
    'ForOfStatement:exit': forOfLoop.exit,
    WhileStatement: whileLoop.enter,
    'WhileStatement:exit': whileLoop.exit,
    DoWhileStatement: doWhileLoop.enter,
    'DoWhileStatement:exit': doWhileLoop.exit,

    SwitchCase(node: ESTreeNode) {
      const switchCase = node as SwitchCaseNode;
      if (switchCase.test !== null) {
        addCyclomatic(node, 'case');
      }
    },
    SwitchStatement(node: ESTreeNode) {
      addStructuralCognitive(node, 'switch');
      addNestingNode(node);
    },
    'SwitchStatement:exit'(node: ESTreeNode) {
      handleNestingExit(node);
    },

    CatchClause(node: ESTreeNode) {
      addCyclomatic(node, 'catch');
      addStructuralCognitive(node, 'catch');
      addNestingNode((node as CatchClauseNode).body);
    },
    'CatchClause:exit'(node: ESTreeNode) {
      handleNestingExit((node as CatchClauseNode).body);
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

    BreakStatement(node: ESTreeNode) {
      handleLabeledJump(node, 'break');
    },
    ContinueStatement(node: ESTreeNode) {
      handleLabeledJump(node, 'continue');
    },

    CallExpression(node: ESTreeNode) {
      const scope = getCurrentScope();
      if (!scope?.name) return;

      if (!scope.hasRecursiveCall && isRecursiveCall(node as CallExpressionNode, scope.name)) {
        scope.hasRecursiveCall = true;
        addCognitive(node, 'recursive call');
      }
    },
  } as Visitor;
}
