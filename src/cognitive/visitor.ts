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
import { isReactComponent } from './react.js';
import { isRecursiveCall } from './recursion.js';
import { createComplexityPoint, DEFAULT_COMPLEXITY_INCREMENT } from '../utils.js';
import { createComplexityVisitor } from '../visitor.js';

interface CognitiveFunctionScope extends FunctionScope {
  nestingLevel: number;
  nestingNodes: Set<ESTreeNode>;
  isReactComponent: boolean;
  hasRecursiveCall: boolean;
}

interface VisitorContext {
  getCurrentScope: () => CognitiveFunctionScope | undefined;
  addComplexity: (node: ESTreeNode, message: string) => void;
  addStructuralComplexity: (node: ESTreeNode, message: string) => void;
  addNestingNode: (node: ESTreeNode) => void;
  context: Context;
}

/** Handle nesting level tracking on node enter */
function handleNodeEnter(
  node: ESTreeNode,
  getCurrentScope: () => CognitiveFunctionScope | undefined
): void {
  const scope = getCurrentScope();
  if (scope?.nestingNodes.has(node)) {
    scope.nestingLevel++;
  }
}

/** Handle nesting level tracking on node exit */
function handleNodeExit(
  node: ESTreeNode,
  getCurrentScope: () => CognitiveFunctionScope | undefined
): void {
  const scope = getCurrentScope();
  if (scope?.nestingNodes.has(node)) {
    scope.nestingLevel--;
    scope.nestingNodes.delete(node);
  }
}

/** Handle if statements with proper complexity and nesting */
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

/** Handle logical expressions with pattern exclusions */
function handleLogicalExpression(node: LogicalExpressionNode, ctx: VisitorContext): void {
  const scope = ctx.getCurrentScope();
  if (!scope) return;

  if (isJsxShortCircuit(node) || isDefaultValuePattern(node, ctx.context)) {
    return;
  }

  const parent = node.parent as LogicalExpressionNode | undefined;
  const isPartOfSameSequence =
    parent?.type === 'LogicalExpression' && parent.operator === node.operator;

  if (!isPartOfSameSequence) {
    ctx.addComplexity(node, `logical operator '${node.operator}'`);
  }
}

/** Build the visitor handlers object */
function buildVisitorHandlers(baseVisitor: Partial<Visitor>, ctx: VisitorContext): Visitor {
  const createLoopHandler = (message: string) => (node: ESTreeNode & { body: ESTreeNode }) => {
    ctx.addStructuralComplexity(node, message);
    ctx.addNestingNode(node.body);
  };

  return {
    ...baseVisitor,

    '*': (node: ESTreeNode) => handleNodeEnter(node, ctx.getCurrentScope),
    '*:exit': (node: ESTreeNode) => handleNodeExit(node, ctx.getCurrentScope),

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

    BreakStatement(node: LabeledJumpStatementNode): void {
      if (node.label) {
        ctx.addComplexity(node, `break to label '${node.label.name}'`);
      }
    },

    ContinueStatement(node: LabeledJumpStatementNode): void {
      if (node.label) {
        ctx.addComplexity(node, `continue to label '${node.label.name}'`);
      }
    },

    LogicalExpression: (node: LogicalExpressionNode) => handleLogicalExpression(node, ctx),
  } as Visitor;
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
  let globalFunctionNestingLevel = 0;

  const { context: visitorCtx, baseVisitor } = createComplexityVisitor<CognitiveFunctionScope>({
    createScope: (node, name) => ({
      node,
      name,
      points: [],
      nestingLevel: 0,
      nestingNodes: new Set(),
      isReactComponent: isReactComponent(node as FunctionNode, name),
      hasRecursiveCall: false,
    }),

    onEnterFunction(_scope, parentScope, node) {
      if (parentScope && globalFunctionNestingLevel > 0) {
        parentScope.points.push(
          createComplexityPoint(
            node,
            `nested ${node.type === 'ArrowFunctionExpression' ? 'arrow function' : 'function'}`
          )
        );
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
      onComplexityCalculated(result, node);
    },
  });

  const { getCurrentScope, addComplexity } = visitorCtx;

  const addStructuralComplexity = (node: ESTreeNode, message: string): void => {
    const scope = getCurrentScope();
    if (scope) {
      scope.points.push(
        createComplexityPoint(node, message, DEFAULT_COMPLEXITY_INCREMENT, scope.nestingLevel)
      );
    }
  };

  const addNestingNode = (node: ESTreeNode): void => {
    const scope = getCurrentScope();
    if (scope) {
      scope.nestingNodes.add(node);
    }
  };

  return buildVisitorHandlers(baseVisitor, {
    getCurrentScope,
    addComplexity,
    addStructuralComplexity,
    addNestingNode,
    context,
  });
}
