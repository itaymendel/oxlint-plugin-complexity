import type {
  Context,
  Visitor,
  ESTreeNode,
  LogicalExpressionNode,
  IfStatementNode,
  LabeledJumpStatementNode,
  ConditionalExpressionNode,
  CallExpressionNode,
  CatchClauseNode,
  SwitchStatementNode,
  FunctionNode,
  ComplexityResult,
  FunctionScope,
} from '../types.js';
import { isElseIf, isDefaultValuePattern, isJsxShortCircuit } from './patterns.js';
import { isRecursiveCall } from './recursion.js';
import { createComplexityPoint, DEFAULT_COMPLEXITY_INCREMENT, getFunctionName } from '../utils.js';
import { createComplexityVisitor } from '../visitor.js';
import { getVariablesForFunction } from '../extraction/variable-tracker.js';
import type { VariableInfo } from '../extraction/types.js';

interface CognitiveFunctionScope extends FunctionScope {
  nestingLevel: number;
  nestingNodes: Set<ESTreeNode>;
  hasRecursiveCall: boolean;
}

interface VisitorContext {
  getCurrentScope: () => CognitiveFunctionScope | undefined;
  addComplexity: (node: ESTreeNode, message: string) => void;
  addStructuralComplexity: (node: ESTreeNode, message: string) => void;
  addNestingNode: (node: ESTreeNode) => void;
  ruleContext: Context;
}

function handleNestingEnter(
  node: ESTreeNode,
  getCurrentScope: () => CognitiveFunctionScope | undefined
): void {
  const scope = getCurrentScope();
  if (!scope?.nestingNodes.has(node)) return;
  scope.nestingLevel++;
}

function handleNestingExit(
  node: ESTreeNode,
  getCurrentScope: () => CognitiveFunctionScope | undefined
): void {
  const scope = getCurrentScope();
  if (!scope?.nestingNodes.has(node)) return;
  scope.nestingLevel--;
  scope.nestingNodes.delete(node);
}

function handleIfStatement(node: IfStatementNode, ctx: VisitorContext): void {
  if (isElseIf(node)) {
    ctx.addComplexity(node, 'else if');
  } else {
    ctx.addStructuralComplexity(node, 'if');
  }

  ctx.addNestingNode(node.consequent as ESTreeNode);

  if (node.alternate && node.alternate.type !== 'IfStatement') {
    ctx.addNestingNode(node.alternate as ESTreeNode);
    ctx.addComplexity(node.alternate as ESTreeNode, 'else');
  }
}

function handleLogicalExpression(node: LogicalExpressionNode, ctx: VisitorContext): void {
  if (!ctx.getCurrentScope()) return;
  if (isJsxShortCircuit(node) || isDefaultValuePattern(node, ctx.ruleContext)) return;

  const parent = node.parent as LogicalExpressionNode | undefined;
  const isContinuationOfSameOperator =
    parent?.type === 'LogicalExpression' && parent.operator === node.operator;

  if (!isContinuationOfSameOperator) {
    ctx.addComplexity(node, `logical operator '${node.operator}'`);
  }
}

function handleLabeledJump(
  node: LabeledJumpStatementNode,
  keyword: 'break' | 'continue',
  ctx: VisitorContext
): void {
  if (node.label) {
    ctx.addComplexity(node, `${keyword} to label '${node.label.name}'`);
  }
}

function buildVisitorHandlers(baseVisitor: Partial<Visitor>, ctx: VisitorContext): Visitor {
  const createLoopHandler = (message: string) => (node: ESTreeNode & { body: ESTreeNode }) => {
    ctx.addStructuralComplexity(node, message);
    ctx.addNestingNode(node.body);
  };

  return {
    ...baseVisitor,

    '*': (node: ESTreeNode) => handleNestingEnter(node, ctx.getCurrentScope),
    '*:exit': (node: ESTreeNode) => handleNestingExit(node, ctx.getCurrentScope),

    CallExpression(node: CallExpressionNode): void {
      const scope = ctx.getCurrentScope();
      if (scope?.name && isRecursiveCall(node, scope.name)) {
        scope.hasRecursiveCall = true;
      }
    },

    IfStatement: (node: IfStatementNode) => handleIfStatement(node, ctx),

    ForStatement: createLoopHandler('for'),
    ForInStatement: createLoopHandler('for...in'),
    ForOfStatement: createLoopHandler('for...of'),
    WhileStatement: createLoopHandler('while'),
    DoWhileStatement: createLoopHandler('do...while'),

    SwitchStatement(node: SwitchStatementNode): void {
      ctx.addStructuralComplexity(node, 'switch');
      for (const switchCase of node.cases) {
        ctx.addNestingNode(switchCase as ESTreeNode);
      }
    },

    CatchClause(node: CatchClauseNode): void {
      ctx.addStructuralComplexity(node, 'catch');
      ctx.addNestingNode(node.body as ESTreeNode);
    },

    ConditionalExpression(node: ConditionalExpressionNode): void {
      ctx.addStructuralComplexity(node, 'ternary operator');
      ctx.addNestingNode(node.consequent as ESTreeNode);
      ctx.addNestingNode(node.alternate as ESTreeNode);
    },

    BreakStatement: (node: LabeledJumpStatementNode) => handleLabeledJump(node, 'break', ctx),
    ContinueStatement: (node: LabeledJumpStatementNode) => handleLabeledJump(node, 'continue', ctx),

    LogicalExpression: (node: LogicalExpressionNode) => handleLogicalExpression(node, ctx),
  } as Visitor;
}

interface CognitiveVisitorOptions<TResult extends ComplexityResult> {
  onComplexityCalculated: (result: TResult, node: ESTreeNode) => void;
  onEnterTopLevelFunction?: (node: ESTreeNode) => void;
  onExitTopLevelFunction?: (node: ESTreeNode) => Partial<TResult>;
}

function createCognitiveVisitorCore<TResult extends ComplexityResult>(
  context: Context,
  options: CognitiveVisitorOptions<TResult>
): Visitor {
  let globalFunctionNestingLevel = 0;

  const { context: visitorCtx, baseVisitor } = createComplexityVisitor<CognitiveFunctionScope>({
    createScope: (node, name) => ({
      node,
      name,
      points: [],
      nestingLevel: 0,
      nestingNodes: new Set(),
      hasRecursiveCall: false,
    }),

    onEnterFunction(parentScope, node) {
      if (globalFunctionNestingLevel === 0) {
        options.onEnterTopLevelFunction?.(node);
      }

      if (parentScope && globalFunctionNestingLevel > 0) {
        const functionType =
          node.type === 'ArrowFunctionExpression' ? 'arrow function' : 'function';
        parentScope.points.push(createComplexityPoint(node, `nested ${functionType}`));
      }
      globalFunctionNestingLevel++;
    },

    onExitFunction(scope, node) {
      globalFunctionNestingLevel--;
      if (scope.hasRecursiveCall) {
        scope.points.push(createComplexityPoint(node, 'recursion'));
      }
    },

    onComplexityCalculated(result, node) {
      const additionalData =
        globalFunctionNestingLevel === 0 ? (options.onExitTopLevelFunction?.(node) ?? {}) : {};

      options.onComplexityCalculated({ ...result, ...additionalData } as TResult, node);
    },
  });

  const { getCurrentScope, addComplexity } = visitorCtx;

  function addStructuralComplexity(node: ESTreeNode, message: string): void {
    const scope = getCurrentScope();
    if (scope) {
      scope.points.push(
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

  return buildVisitorHandlers(baseVisitor, {
    getCurrentScope,
    addComplexity,
    addStructuralComplexity,
    addNestingNode,
    ruleContext: context,
  });
}

/**
 * Calculate cognitive complexity for a function body.
 *
 * STRUCTURAL COMPLEXITY (+1 + nesting):
 * - if (except else-if), loops, switch, catch, ternary
 *
 * FLAT COMPLEXITY (+1 only):
 * - else-if, else, labeled break/continue, logical operators (per sequence)
 *
 * ADDITIONAL FEATURES:
 * - Nested function penalty: +1 for each level of function nesting
 * - Recursion detection: +1 for direct recursive calls
 *
 * EXCLUDED PATTERNS:
 * - Default value patterns: `const x = a || literal`, `a = a || literal`
 * - JSX short-circuit: `{show && <Component />}`
 */
export function createCognitiveVisitor(
  context: Context,
  onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void
): Visitor {
  return createCognitiveVisitorCore(context, { onComplexityCalculated });
}

export interface ComplexityResultWithVariables extends ComplexityResult {
  variables: Map<string, VariableInfo>;
  functionName: string;
}

/**
 * Create a cognitive complexity visitor that also tracks variables within functions.
 *
 * Uses oxlint's built-in scope manager to collect variable information,
 * which is then available in the complexity result for extraction analysis.
 */
export function createCognitiveVisitorWithTracking(
  context: Context,
  onComplexityCalculated: (result: ComplexityResultWithVariables, node: ESTreeNode) => void
): Visitor {
  return createCognitiveVisitorCore<ComplexityResultWithVariables>(context, {
    onExitTopLevelFunction(node) {
      const variables = getVariablesForFunction(context, node);
      const funcNode = node as FunctionNode;
      const functionName = getFunctionName(funcNode, funcNode.parent);
      return { variables, functionName };
    },

    onComplexityCalculated,
  });
}
