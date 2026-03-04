/**
 * Halstead operator/operand classification for JavaScript/TypeScript AST nodes.
 * Based on escomplex's es5.js (MIT), extended for modern JS/TS.
 */
import type { ESTreeNode } from '../types.js';
import type { HalsteadCounts } from './halstead.js';
import { createHalsteadCounts, incrementCount } from './halstead.js';

export interface HalsteadVisitorCallbacks {
  onFunctionEnter?: () => void;
  onFunctionExit?: (counts: HalsteadCounts) => void;
}

function getNodeOperator(node: ESTreeNode): string {
  return (node as unknown as { operator: string }).operator;
}

/** Caller must pre-check that parent type is MemberExpression, Property, or MethodDefinition. */
function isNonComputedKeyOf(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  const keyed = parent as unknown as { key?: ESTreeNode; property?: ESTreeNode; computed: boolean };
  if (keyed.computed) return false;
  return keyed.key === node || keyed.property === node;
}

const DECLARATION_PARENTS = new Map<string, string>([
  ['VariableDeclarator', 'id'],
  ['ImportSpecifier', 'local'],
  ['ImportDefaultSpecifier', 'local'],
  ['ImportNamespaceSpecifier', 'local'],
  ['CatchClause', 'param'],
  ['LabeledStatement', 'label'],
]);

/** Skip identifiers at declaration sites (they are not operands). */
// eslint-disable-next-line complexity/complexity -- Type-dispatch across many AST parent types
function isDeclarationIdentifier(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (!parent) return false;

  const n = node as unknown as { name: string };

  if (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression') {
    const fn = parent as unknown as { id?: { name: string }; params: ESTreeNode[] };
    return fn.id?.name === n.name || (fn.params?.includes(node) ?? false);
  }

  if (parent.type === 'ArrowFunctionExpression') {
    const arrow = parent as unknown as { params: ESTreeNode[] };
    return arrow.params?.includes(node) ?? false;
  }

  if (parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') {
    const cls = parent as unknown as { id?: { name: string } };
    return cls.id?.name === n.name;
  }

  const prop = DECLARATION_PARENTS.get(parent.type);
  if (prop) {
    return (parent as unknown as Record<string, unknown>)[prop] === node;
  }

  return false;
}

// eslint-disable-next-line complexity/complexity -- Visitor factory pattern requires many nested handlers
export function createHalsteadVisitorHandlers(callbacks?: HalsteadVisitorCallbacks): {
  handlers: Record<string, (node: ESTreeNode) => void>;
  moduleCounts: HalsteadCounts;
} {
  const moduleCounts = createHalsteadCounts();
  const scopeStack: HalsteadCounts[] = [];

  function currentScope(): HalsteadCounts | undefined {
    return scopeStack[scopeStack.length - 1];
  }

  function addCount(kind: 'operators' | 'operands', name: string): void {
    incrementCount(moduleCounts[kind], name);
    const scope = currentScope();
    if (scope) {
      incrementCount(scope[kind], name);
    }
  }

  function addOperator(name: string): void {
    addCount('operators', name);
  }

  function addOperand(name: string): void {
    addCount('operands', name);
  }

  function enterFunction(): void {
    scopeStack.push(createHalsteadCounts());
    callbacks?.onFunctionEnter?.();
  }

  function exitFunction(): void {
    const scope = scopeStack.pop();
    if (scope) {
      callbacks?.onFunctionExit?.(scope);
    }
  }

  function operatorHandler(name: string): () => void {
    return () => addOperator(name);
  }

  function nodeOperatorHandler(): (node: ESTreeNode) => void {
    return (node: ESTreeNode) => addOperator(getNodeOperator(node));
  }

  function handleNamedFunction(node: ESTreeNode): void {
    enterFunction();
    addOperator('function');
    const fn = node as unknown as { id?: { name: string } };
    if (fn.id?.name) addOperand(fn.id.name);
  }

  const handlers: Record<string, (node: ESTreeNode) => void> = {
    FunctionDeclaration: handleNamedFunction,
    'FunctionDeclaration:exit': () => exitFunction(),
    FunctionExpression: handleNamedFunction,
    'FunctionExpression:exit': () => exitFunction(),
    ArrowFunctionExpression() {
      enterFunction();
      addOperator('=>');
    },
    'ArrowFunctionExpression:exit': () => exitFunction(),

    IfStatement: operatorHandler('if'),
    'IfStatement:exit'(node: ESTreeNode) {
      const ifNode = node as unknown as { alternate?: ESTreeNode };
      if (ifNode.alternate) addOperator('else');
    },
    ForStatement: operatorHandler('for'),
    ForInStatement: operatorHandler('forin'),
    ForOfStatement: operatorHandler('forof'),
    WhileStatement: operatorHandler('while'),
    DoWhileStatement: operatorHandler('dowhile'),
    SwitchStatement: operatorHandler('switch'),
    SwitchCase(node: ESTreeNode) {
      const sc = node as unknown as { test: unknown };
      addOperator(sc.test !== null ? 'case' : 'default');
    },
    CatchClause: operatorHandler('catch'),
    BreakStatement: operatorHandler('break'),
    ContinueStatement: operatorHandler('continue'),
    ReturnStatement: operatorHandler('return'),
    ThrowStatement: operatorHandler('throw'),

    NewExpression: operatorHandler('new'),
    ClassDeclaration: operatorHandler('class'),
    ClassExpression: operatorHandler('class'),
    ImportDeclaration: operatorHandler('import'),
    ExportNamedDeclaration: operatorHandler('export'),
    ExportDefaultDeclaration: operatorHandler('export'),
    AwaitExpression: operatorHandler('await'),
    YieldExpression: operatorHandler('yield'),

    BinaryExpression: nodeOperatorHandler(),
    LogicalExpression: nodeOperatorHandler(),
    AssignmentExpression: nodeOperatorHandler(),
    UnaryExpression: nodeOperatorHandler(),
    UpdateExpression: nodeOperatorHandler(),

    CallExpression: operatorHandler('()'),
    ArrayExpression: operatorHandler('[]'),
    ObjectExpression: operatorHandler('{}'),

    MemberExpression(node: ESTreeNode) {
      const member = node as unknown as { optional?: boolean; computed: boolean };
      addOperator(member.computed ? '[]' : member.optional ? '?.' : '.');
    },

    Property: operatorHandler(':'),
    ConditionalExpression: operatorHandler('?:'),

    VariableDeclaration(node: ESTreeNode) {
      const decl = node as unknown as { kind: string };
      addOperator(decl.kind);
    },
    VariableDeclarator(node: ESTreeNode) {
      const declarator = node as unknown as { init: unknown; id: ESTreeNode };
      if (declarator.init !== null && declarator.init !== undefined) {
        addOperator('=');
      }
      const id = declarator.id as unknown as { name?: string; type: string };
      if (id.type === 'Identifier' && id.name) {
        addOperand(id.name);
      }
    },

    TemplateLiteral: operatorHandler('`'),
    SpreadElement: operatorHandler('...'),
    RestElement: operatorHandler('...'),

    Identifier(node: ESTreeNode) {
      if (isDeclarationIdentifier(node)) return;
      const pt = node.parent?.type;
      if (pt === 'MemberExpression' || pt === 'Property' || pt === 'MethodDefinition') {
        if (isNonComputedKeyOf(node)) return;
      }
      addOperand((node as unknown as { name: string }).name);
    },

    Literal(node: ESTreeNode) {
      const lit = node as unknown as { value: unknown; raw?: string };
      addOperand(lit.raw ?? String(lit.value));
    },

    ThisExpression() {
      addOperand('this');
    },

    TemplateElement(node: ESTreeNode) {
      const elem = node as unknown as { value: { raw: string } };
      if (elem.value.raw) {
        addOperand(elem.value.raw);
      }
    },
  };

  return { handlers, moduleCounts };
}
