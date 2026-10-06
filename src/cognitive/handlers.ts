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
  ComplexityPoint,
  FunctionScope,
} from '../types.js';
import { isElseIf, isDefaultValuePattern, isJsxShortCircuit } from './patterns.js';
import { isRecursiveCall } from './recursion.js';
import { createComplexityPoint, DEFAULT_COMPLEXITY_INCREMENT, isFunctionNode } from '../utils.js';

export interface CognitiveFunctionScope extends FunctionScope {
  nestingLevel: number;
  nestingNodes: Set<ESTreeNode>;
  hasRecursiveCall: boolean;
}

// Preserve each public visitor's existing diagnostic presentation, not separate scoring rules.
const POINT_FORMATS = {
  standalone: {
    forIn: 'for...in',
    forOf: 'for...of',
    doWhile: 'do...while',
    recursion: 'function',
  },
  combined: {
    forIn: 'for-in',
    forOf: 'for-of',
    doWhile: 'do-while',
    recursion: 'call',
  },
} as const;

interface CognitiveHandlerOptions<T extends CognitiveFunctionScope> {
  getScopeFor: (node: ESTreeNode) => T | undefined;
  getPoints: (scope: T) => ComplexityPoint[];
  pointFormat: keyof typeof POINT_FORMATS;
}

interface VisitorContext {
  getScopeFor: (node: ESTreeNode) => CognitiveFunctionScope | undefined;
  addComplexity: (node: ESTreeNode, message: string) => void;
  addStructuralComplexity: (node: ESTreeNode, message: string) => void;
  addNestingNode: (node: ESTreeNode) => void;
  ruleContext: Context;
  format: (typeof POINT_FORMATS)[keyof typeof POINT_FORMATS];
}

export function createCognitiveScope(
  node: ESTreeNode,
  name: string | null
): CognitiveFunctionScope {
  return {
    node,
    name,
    points: [],
    nestingLevel: 0,
    nestingNodes: new Set(),
    hasRecursiveCall: false,
  };
}

function handleNestingEnter(node: ESTreeNode, getScopeFor: VisitorContext['getScopeFor']): void {
  const scope = getScopeFor(node);
  if (!scope?.nestingNodes.has(node)) return;
  scope.nestingLevel++;
}

function handleNestingExit(node: ESTreeNode, getScopeFor: VisitorContext['getScopeFor']): void {
  const scope = getScopeFor(node);
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

  ctx.addNestingNode(node.consequent);

  if (node.alternate && node.alternate.type !== 'IfStatement') {
    ctx.addNestingNode(node.alternate);
    ctx.addComplexity(node, 'else');
  }
}

function handleLogicalExpression(node: LogicalExpressionNode, ctx: VisitorContext): void {
  if (!ctx.getScopeFor(node)) return;
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

function buildVisitorHandlers(ctx: VisitorContext) {
  const createLoopHandler = (message: string) => (node: ESTreeNode & { body: ESTreeNode }) => {
    ctx.addStructuralComplexity(node, message);
    ctx.addNestingNode(node.body);
  };

  return {
    '*': (node: ESTreeNode) => handleNestingEnter(node, ctx.getScopeFor),
    '*:exit': (node: ESTreeNode) => handleNestingExit(node, ctx.getScopeFor),

    CallExpression(node: CallExpressionNode): void {
      const scope = ctx.getScopeFor(node);
      if (!scope?.name || !isFunctionNode(scope.node) || scope.hasRecursiveCall) return;
      if (!isRecursiveCall(node, scope.name)) return;

      scope.hasRecursiveCall = true;
      if (ctx.format.recursion === 'call') {
        ctx.addComplexity(node, 'recursive call');
      }
    },

    IfStatement: (node: IfStatementNode) => handleIfStatement(node, ctx),

    ForStatement: createLoopHandler('for'),
    ForInStatement: createLoopHandler(ctx.format.forIn),
    ForOfStatement: createLoopHandler(ctx.format.forOf),
    WhileStatement: createLoopHandler('while'),
    DoWhileStatement: createLoopHandler(ctx.format.doWhile),

    SwitchStatement(node: SwitchStatementNode): void {
      ctx.addStructuralComplexity(node, 'switch');
      for (const switchCase of node.cases) {
        ctx.addNestingNode(switchCase);
      }
    },

    CatchClause(node: CatchClauseNode): void {
      ctx.addStructuralComplexity(node, 'catch');
      ctx.addNestingNode(node.body);
    },

    ConditionalExpression(node: ConditionalExpressionNode): void {
      ctx.addStructuralComplexity(node, 'ternary operator');
      ctx.addNestingNode(node.consequent);
      ctx.addNestingNode(node.alternate);
    },

    BreakStatement: (node: LabeledJumpStatementNode) => handleLabeledJump(node, 'break', ctx),
    ContinueStatement: (node: LabeledJumpStatementNode) => handleLabeledJump(node, 'continue', ctx),

    LogicalExpression: (node: LogicalExpressionNode) => handleLogicalExpression(node, ctx),
  } satisfies Visitor;
}

/** Cognitive scoring and lifecycle hooks, using the caller's existing scope stack. */
export function createCognitiveHandlers<T extends CognitiveFunctionScope>(
  context: Context,
  { getScopeFor, getPoints, pointFormat }: CognitiveHandlerOptions<T>
) {
  const format = POINT_FORMATS[pointFormat];

  function addComplexity(node: ESTreeNode, message: string): void {
    const scope = getScopeFor(node);
    if (scope) {
      getPoints(scope).push(createComplexityPoint(node, message));
    }
  }

  function addStructuralComplexity(node: ESTreeNode, message: string): void {
    const scope = getScopeFor(node);
    if (scope) {
      getPoints(scope).push(
        createComplexityPoint(node, message, DEFAULT_COMPLEXITY_INCREMENT, scope.nestingLevel)
      );
    }
  }

  function addNestingNode(node: ESTreeNode): void {
    // Function branches/bodies open their own scope and must not leave a marker in the parent.
    if (isFunctionNode(node)) return;
    getScopeFor(node)?.nestingNodes.add(node);
  }

  return {
    visitor: buildVisitorHandlers({
      getScopeFor,
      addComplexity,
      addStructuralComplexity,
      addNestingNode,
      ruleContext: context,
      format,
    }),

    onEnterFunction(parentScope: T | undefined, node: ESTreeNode): void {
      if (parentScope && isFunctionNode(node) && isFunctionNode(parentScope.node)) {
        const functionType =
          node.type === 'ArrowFunctionExpression' ? 'arrow function' : 'function';
        getPoints(parentScope).push(createComplexityPoint(node, `nested ${functionType}`));
      }
    },

    onExitFunction(scope: T, node: ESTreeNode): void {
      if (scope.hasRecursiveCall && format.recursion === 'function') {
        getPoints(scope).push(createComplexityPoint(node, 'recursion'));
      }
    },
  };
}
