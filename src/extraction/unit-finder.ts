import type { ESTree } from '@oxlint/plugins';
import type { ComplexityPoint, ESTreeNode } from '../types.js';
import type { ExtractionCandidate } from './types.js';
import { LOOP_STATEMENTS, getNodeProp, isNodeLike } from './ast-utils.js';

type Statement = ESTree.Statement;

interface Position {
  line: number;
  column: number;
}

/** Structural info about the AST block a candidate covers (internal, not public API). */
export interface ExtractionUnitInfo {
  kind: 'statement' | 'body' | 'case';
  /** Compound statements and statement-list bodies are preferred over simple statements */
  compound: boolean;
  nodes: ESTreeNode[];
  /** Nothing runs after this unit in the enclosing function */
  isTail: boolean;
}

export interface AstUnit extends ExtractionUnitInfo {
  start: Position;
  end: Position;
}

/** An extraction candidate; hand-built candidates (tests) have no unit info. */
export type UnitCandidate = ExtractionCandidate & { unit?: ExtractionUnitInfo };

const COMPOUND_STATEMENTS = new Set([
  ...LOOP_STATEMENTS,
  'IfStatement',
  'SwitchStatement',
  'TryStatement',
  'LabeledStatement',
  'BlockStatement',
]);

/**
 * Line-based flow analysis is only sound when a unit shares no line with its neighbours
 * (the enclosing `{`/`}` lines, or the `case x:` header, at the edges).
 */
function addUnit(
  out: AstUnit[],
  info: ExtractionUnitInfo,
  prevEndLine: number,
  nextStartLine: number
): void {
  const { nodes } = info;
  if (nodes.length === 0) return;
  const start = nodes[0].loc.start;
  const end = nodes[nodes.length - 1].loc.end;
  if (start.line <= prevEndLine || end.line >= nextStartLine) return;
  out.push({ ...info, start, end });
}

function visitList(
  out: AstUnit[],
  list: Statement[],
  tail: boolean,
  openLine: number,
  closeLine: number
): void {
  for (const [i, statement] of list.entries()) {
    const prevEnd = i > 0 ? list[i - 1].loc.end.line : openLine;
    const nextStart = i < list.length - 1 ? list[i + 1].loc.start.line : closeLine;
    const isTail = tail && i === list.length - 1;
    const compound = COMPOUND_STATEMENTS.has(statement.type);
    addUnit(out, { kind: 'statement', compound, nodes: [statement], isTail }, prevEnd, nextStart);
    visitChildren(out, statement, isTail);
  }
}

/** Branch/loop/try bodies: the inner statements without the braces. */
function visitBody(out: AstUnit[], block: Statement | null | undefined, tail: boolean): void {
  if (block?.type !== 'BlockStatement') return;
  const { start, end } = block.loc;
  addUnit(
    out,
    { kind: 'body', compound: true, nodes: block.body, isTail: tail },
    start.line,
    end.line
  );
  visitList(out, block.body, tail, start.line, end.line);
}

/** Descend into a branch without a unit of its own (braceless `if (a) for (...) {}`). */
function visitBranch(out: AstUnit[], branch: Statement, tail: boolean): void {
  if (branch.type === 'BlockStatement') visitBody(out, branch, tail);
  else visitChildren(out, branch, tail);
}

function visitIfChain(out: AstUnit[], statement: ESTree.IfStatement, tail: boolean): void {
  visitBranch(out, statement.consequent, tail);
  const { alternate } = statement;
  if (alternate?.type === 'IfStatement') visitIfChain(out, alternate, tail);
  else if (alternate) visitBranch(out, alternate, tail);
}

function visitTry(out: AstUnit[], statement: ESTree.TryStatement, tail: boolean): void {
  visitBody(out, statement.block, tail);
  visitBody(out, statement.handler?.body, tail);
  visitBody(out, statement.finalizer, false);
}

interface CaseBody {
  nodes: Statement[];
  /** First line of the stripped trailing `break`, if any */
  breakLine: number | null;
}

/** Drop a trailing unconditional `break`, also when it ends a sole `{ ... }` consequent. */
function stripTrailingBreak(consequent: Statement[]): CaseBody {
  const last = consequent.at(-1);
  if (last?.type === 'BreakStatement' && !last.label) {
    return { nodes: consequent.slice(0, -1), breakLine: last.loc.start.line };
  }
  if (consequent.length === 1 && last?.type === 'BlockStatement') {
    const inner = stripTrailingBreak(last.body);
    if (inner.breakLine !== null) return inner;
  }
  return { nodes: consequent, breakLine: null };
}

function visitSwitch(out: AstUnit[], statement: ESTree.SwitchStatement): void {
  for (const [i, switchCase] of statement.cases.entries()) {
    const nextCase = statement.cases[i + 1];
    const nextStart = nextCase ? nextCase.loc.start.line : statement.loc.end.line;
    const headerEnd = switchCase.test ? switchCase.test.loc.end.line : switchCase.loc.start.line;
    const { nodes, breakLine } = stripTrailingBreak(switchCase.consequent);
    addUnit(
      out,
      { kind: 'case', compound: true, nodes, isTail: false },
      headerEnd,
      breakLine ?? nextStart
    );
    visitList(out, switchCase.consequent, false, headerEnd, nextStart);
  }
}

function visitChildren(out: AstUnit[], statement: Statement, tail: boolean): void {
  switch (statement.type) {
    case 'IfStatement':
      visitIfChain(out, statement, tail);
      break;
    case 'BlockStatement':
      visitList(out, statement.body, tail, statement.loc.start.line, statement.loc.end.line);
      break;
    case 'LabeledStatement':
      visitChildren(out, statement.body, tail);
      break;
    case 'TryStatement':
      visitTry(out, statement, tail);
      break;
    case 'SwitchStatement':
      visitSwitch(out, statement);
      break;
    default:
      if (LOOP_STATEMENTS.has(statement.type)) {
        visitBranch(out, (statement as ESTree.WhileStatement).body, false);
      }
  }
}

/**
 * Enumerate the AST blocks of a function that can be extracted as a unit:
 * every statement of a statement list, branch/loop/try bodies, and switch cases.
 * Nested functions and expressions are never entered.
 */
export function findUnits(functionNode: ESTreeNode): AstUnit[] {
  const out: AstUnit[] = [];
  const body = functionNode.type === 'StaticBlock' ? functionNode : getFunctionBody(functionNode);
  // ASTs without `loc` (e.g. a default oxc-parser tree) have no lines to build units from
  if (body?.loc && (body.type === 'BlockStatement' || body.type === 'StaticBlock')) {
    visitList(out, body.body, true, body.loc.start.line, body.loc.end.line);
  }
  return out;
}

function getFunctionBody(functionNode: ESTreeNode): ESTreeNode | null {
  const body = getNodeProp(functionNode, 'body');
  return isNodeLike(body) ? body : null;
}

function isBefore(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.column < b.column);
}

interface PointIndex {
  sorted: ComplexityPoint[];
  /** prefix[i] = total complexity of sorted[0..i) */
  prefix: number[];
}

/** Sort points by start position once (dropping synthetic line-0 points) and prefix-sum them. */
export function indexPoints(points: ComplexityPoint[]): PointIndex {
  const sorted = points
    .filter((p) => p.location.start.line > 0)
    .toSorted((a, b) =>
      a.location.start.line === b.location.start.line
        ? a.location.start.column - b.location.start.column
        : a.location.start.line - b.location.start.line
    );
  const prefix = [0];
  let running = 0;
  for (const point of sorted) {
    running += point.complexity;
    prefix.push(running);
  }
  return { sorted, prefix };
}

/** First index whose point starts at or after `position`. */
function lowerBound(sorted: ComplexityPoint[], position: Position): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (isBefore(sorted[mid].location.start, position)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Points whose start lies inside the unit, with their summed complexity. */
export function pointsInUnit(
  index: PointIndex,
  unit: AstUnit
): { points: ComplexityPoint[]; complexity: number } {
  const from = lowerBound(index.sorted, unit.start);
  const to = lowerBound(index.sorted, unit.end);
  return {
    points: index.sorted.slice(from, to),
    complexity: index.prefix[to] - index.prefix[from],
  };
}
