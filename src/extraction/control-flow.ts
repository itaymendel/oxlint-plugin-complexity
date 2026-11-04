import type { ESTree } from '@oxlint/plugins';
import type { ESTreeNode } from '../types.js';
import type { AsyncBoundary, EarlyExit } from './types.js';
import type { ExtractionUnitInfo, UnitCandidate } from './unit-finder.js';
import {
  LOOP_STATEMENTS,
  getLine,
  getNodeProp,
  isScopeBoundary,
  walkChildren,
  walkInRange,
  walkNodes,
} from './ast-utils.js';

type RawExit = Omit<EarlyExit, 'replaceable'>;

interface JumpScope {
  loops: number;
  breakables: number;
  labels: readonly string[];
}

interface Collected {
  exits: RawExit[];
  asyncBoundaries: AsyncBoundary[];
}

interface ControlFlow {
  earlyExits: EarlyExit[];
  asyncBoundaries: AsyncBoundary[];
}

const EXIT_KINDS: Partial<Record<string, EarlyExit['kind']>> = {
  ReturnStatement: 'return',
  BreakStatement: 'break',
  ContinueStatement: 'continue',
};

function getLabel(n: ESTreeNode): string | undefined {
  const label = getNodeProp(n, 'label');
  return label ? (getNodeProp(label as ESTreeNode, 'name') as string) : undefined;
}

/** A `break`/`continue` escapes the unit when its target (loop, switch or label) is outside it. */
function escapesUnit(n: ESTreeNode, scope: JumpScope, targets: number): boolean {
  const label = getLabel(n);
  return label === undefined ? targets === 0 : !scope.labels.includes(label);
}

type NodeRecorder = (n: ESTreeNode, scope: JumpScope, out: Collected) => void;

function jumpRecorder(
  kind: 'break' | 'continue',
  targets: (scope: JumpScope) => number
): NodeRecorder {
  return (n, scope, out) => {
    if (escapesUnit(n, scope, targets(scope))) {
      out.exits.push({ kind, line: getLine(n), label: getLabel(n) });
    }
  };
}

const NODE_RECORDERS: Record<string, NodeRecorder> = {
  ReturnStatement: (n, _scope, out) =>
    out.exits.push({ kind: 'return', line: getLine(n), hasArgument: !!getNodeProp(n, 'argument') }),
  BreakStatement: jumpRecorder('break', (scope) => scope.breakables),
  ContinueStatement: jumpRecorder('continue', (scope) => scope.loops),
  AwaitExpression: (n, _scope, out) =>
    out.asyncBoundaries.push({ kind: 'await', line: getLine(n) }),
  YieldExpression: (n, _scope, out) =>
    out.asyncBoundaries.push({ kind: 'yield', line: getLine(n) }),
  ForOfStatement: (n, _scope, out) => {
    if (getNodeProp(n, 'await')) out.asyncBoundaries.push({ kind: 'await', line: getLine(n) });
  },
  VariableDeclaration: (n, _scope, out) => {
    if (getNodeProp(n, 'kind') === 'await using') {
      out.asyncBoundaries.push({ kind: 'await', line: getLine(n) });
    }
  },
};

function enterScope(n: ESTreeNode, scope: JumpScope): JumpScope {
  if (LOOP_STATEMENTS.has(n.type)) {
    return { ...scope, loops: scope.loops + 1, breakables: scope.breakables + 1 };
  }
  if (n.type === 'SwitchStatement') return { ...scope, breakables: scope.breakables + 1 };
  const label = n.type === 'LabeledStatement' ? getLabel(n) : undefined;
  return label === undefined ? scope : { ...scope, labels: [...scope.labels, label] };
}

/** Walk a unit's statements; nested functions (arrows included) and classes are not entered. */
function collect(n: ESTreeNode, scope: JumpScope, out: Collected): void {
  if (isScopeBoundary(n, false)) return;
  NODE_RECORDERS[n.type]?.(n, scope, out);
  const inner = enterScope(n, scope);
  walkChildren(n, (child) => collect(child, inner, out));
}

function ifAbrupt(n: ESTree.IfStatement): boolean {
  return !!n.alternate && stmtAbrupt(n.consequent) && stmtAbrupt(n.alternate);
}

function tryAbrupt(n: ESTree.TryStatement): boolean {
  const bodyAbrupt = stmtAbrupt(n.block) && (!n.handler || stmtAbrupt(n.handler.body));
  return bodyAbrupt || (!!n.finalizer && stmtAbrupt(n.finalizer));
}

function stmtAbrupt(n: ESTreeNode): boolean {
  switch (n.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
      return true;
    case 'BlockStatement':
      return alwaysAbrupt(n.body);
    case 'IfStatement':
      return ifAbrupt(n);
    case 'TryStatement':
      return tryAbrupt(n);
    default:
      return false;
  }
}

/** Every path through the statements ends in `return`/`throw`. */
function alwaysAbrupt(nodes: ESTreeNode[]): boolean {
  return nodes.some(stmtAbrupt);
}

function analyzeUnit(unit: ExtractionUnitInfo): ControlFlow {
  const out: Collected = { exits: [], asyncBoundaries: [] };
  const scope: JumpScope = { loops: 0, breakables: 0, labels: [] };
  for (const node of unit.nodes) collect(node, scope, out);

  // `return extracted(...)` is exact only when nothing runs after the unit (or every path returns)
  const onlyReturns = out.exits.every((exit) => exit.kind === 'return');
  const replaceable = onlyReturns && (unit.isTail || alwaysAbrupt(unit.nodes));
  return {
    earlyExits: out.exits.map((exit) => ({ ...exit, replaceable })),
    asyncBoundaries: out.asyncBoundaries,
  };
}

/**
 * Candidates without unit info (hand-built) are analyzed conservatively: any
 * return/break/continue in the line range is a non-replaceable exit. This also flags a
 * `break`/`continue` whose loop lies wholly inside the range.
 */
function analyzeRange(candidate: UnitCandidate, functionNode: ESTreeNode): ControlFlow {
  const earlyExits: EarlyExit[] = [];
  const { startLine, endLine } = candidate;
  walkInRange(functionNode, startLine, endLine, (n) => {
    const kind = EXIT_KINDS[n.type];
    const line = getLine(n);
    if (kind && line >= startLine && line <= endLine) {
      const hasArgument = kind === 'return' ? !!getNodeProp(n, 'argument') : undefined;
      earlyExits.push({ kind, line, replaceable: false, hasArgument });
    }
  });
  return { earlyExits, asyncBoundaries: [] };
}

export function analyzeControlFlow(
  candidate: UnitCandidate,
  functionNode: ESTreeNode
): ControlFlow {
  return candidate.unit ? analyzeUnit(candidate.unit) : analyzeRange(candidate, functionNode);
}

function isArgumentsReference(n: ESTreeNode): boolean {
  if (n.type !== 'Identifier' || n.name !== 'arguments') return false;
  const parent = n.parent as ESTreeNode | undefined;
  if (parent?.type === 'MemberExpression') {
    return parent.computed || parent.property !== n;
  }
  return !(parent?.type === 'Property' && !parent.computed && parent.key === n);
}

function isThisLike(n: ESTreeNode): boolean {
  return (
    n.type === 'ThisExpression' ||
    n.type === 'Super' ||
    (n.type === 'MetaProperty' && n.meta.name === 'new') ||
    isArgumentsReference(n)
  );
}

/**
 * `this`, `arguments`, `super` and `new.target` are not rebound by arrow functions, so unlike the
 * exit/await walker this check enters nested arrows (but not regular functions or classes).
 */
export function detectThisReferences(candidate: UnitCandidate, functionNode: ESTreeNode): boolean {
  let found = false;
  const visitor = (n: ESTreeNode): void => {
    if (isThisLike(n)) found = true;
  };
  if (candidate.unit) {
    walkNodes(candidate.unit.nodes, visitor, true);
  } else {
    walkInRange(functionNode, candidate.startLine, candidate.endLine, visitor, true);
  }
  return found;
}
