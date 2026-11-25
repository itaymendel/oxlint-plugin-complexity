import type { ESTreeNode } from '../types.js';
import { getNodeProp, isNodeLike, walkChildren } from './ast-utils.js';

/**
 * The declared type of a binding identifier, as the type node inside the annotation: on the
 * identifier itself, or on the rest element that wraps it (`...args: T[]`).
 */
export function annotationTypeNode(identifier: ESTreeNode): ESTreeNode | undefined {
  const own = getNodeProp(identifier, 'typeAnnotation');
  const parent = identifier.parent as ESTreeNode | null | undefined;
  const wrapper =
    !own && parent?.type === 'RestElement' && getNodeProp(parent, 'argument') === identifier
      ? getNodeProp(parent, 'typeAnnotation')
      : own;
  if (!isNodeLike(wrapper)) return undefined;
  const inner = getNodeProp(wrapper, 'typeAnnotation');
  return isNodeLike(inner) ? inner : wrapper;
}

const NEEDS_PARENS_BEFORE_UNION = new Set([
  'TSFunctionType',
  'TSConstructorType',
  'TSConditionalType',
]);

function copyQuoted(s: string, start: number): number {
  const quote = s[start];
  let i = start + 1;
  while (i < s.length && s[i] !== quote) i += s[i] === '\\' ? 2 : 1;
  return Math.min(i + 1, s.length);
}

function copyTemplate(s: string, start: number): number {
  let i = start + 1;
  while (i < s.length && s[i] !== '`') {
    if (s[i] === '\\') {
      i += 2;
    } else if (s[i] === '$' && s[i + 1] === '{') {
      i = copyBraces(s, i + 1);
    } else {
      i++;
    }
  }
  return Math.min(i + 1, s.length);
}

function copyBraces(s: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
    if (c === "'" || c === '"') i = copyQuoted(s, i);
    else if (c === '`') i = copyTemplate(s, i);
    else i++;
  }
  return i;
}

/** Characters that need no space after them / before them when a type is folded onto one line. */
const OPENERS = '([<';
const CLOSERS = ')]>,';

/** The end of the comment starting at `i`, or -1 when there is none. */
function commentEnd(s: string, i: number): number {
  if (s[i] !== '/') return -1;
  if (s[i + 1] === '/') {
    const newline = s.indexOf('\n', i);
    return newline < 0 ? s.length : newline;
  }
  if (s[i + 1] === '*') {
    const close = s.indexOf('*/', i + 2);
    return close < 0 ? s.length : close + 2;
  }
  return -1;
}

/** The end of the string or template literal starting at `i`; `i + 1` for any other character. */
function tokenEnd(s: string, i: number): number {
  const c = s[i];
  if (c === "'" || c === '"') return copyQuoted(s, i);
  return c === '`' ? copyTemplate(s, i) : i + 1;
}

const last = (s: string): string => s.at(-1) ?? '';

/** Whether a space belongs between what is written so far and the next character. */
function needsSpace(out: string, next: string): boolean {
  return out !== '' && !OPENERS.includes(last(out)) && !CLOSERS.includes(next);
}

/** A leading `|` or `&` (as in a multi-line union) adds nothing. */
function isLeadingOperator(out: string, c: string): boolean {
  return '|&'.includes(c) && (out === '' || OPENERS.includes(last(out)));
}

/**
 * Drop comments and fold runs of whitespace into one space, leaving string and template literals
 * (which may contain either) untouched.
 */
export function collapseTypeText(s: string): string {
  let out = '';
  let gap = false;
  let i = 0;
  while (i < s.length) {
    const comment = commentEnd(s, i);
    if (comment >= 0 || /\s/.test(s[i])) {
      gap = true;
      i = comment >= 0 ? comment : i + 1;
    } else if (isLeadingOperator(out, s[i])) {
      i++;
    } else {
      if (gap && needsSpace(out, s[i])) out += ' ';
      gap = false;
      const next = tokenEnd(s, i);
      out += s.slice(i, next);
      i = next;
    }
  }
  return out;
}

function outermostLiterals(node: ESTreeNode, out: ESTreeNode[]): void {
  if (node.type === 'TSTypeLiteral') out.push(node);
  else walkChildren(node, (child) => outermostLiterals(child, out));
}

/**
 * The source text of a type on one line. Members of an object type are separated by newlines in
 * source, so they are rebuilt with `;` instead of being folded into each other.
 */
function oneLine(source: string, node: ESTreeNode): string | undefined {
  const literals: ESTreeNode[] = [];
  outermostLiterals(node, literals);
  let raw = '';
  let cursor = node.start;
  for (const literal of literals.toSorted((a, b) => a.start - b.start)) {
    const members = (getNodeProp(literal, 'members') as ESTreeNode[]).map((member) =>
      oneLine(source, member)?.replace(/[;,]$/, '')
    );
    if (members.some((m) => m === undefined)) return undefined;
    raw += `${source.slice(cursor, literal.start)}${members.length === 0 ? '{}' : `{ ${members.join('; ')} }`}`;
    cursor = literal.end;
  }
  raw += source.slice(cursor, node.end);
  return collapseTypeText(raw);
}

/**
 * Print the declared type of a binding from the source text, verbatim apart from whitespace and
 * comments; `undefined` when there is none or the source is unavailable. Never invents a type.
 */
export function printDeclaredType(source: string, identifier: ESTreeNode): string | undefined {
  const type = annotationTypeNode(identifier);
  if (!type || source === '') return undefined;
  const text = oneLine(source, type);
  if (!text) return undefined;
  // `x?: T` is passed explicitly by the helper's caller, so it becomes `x: T | undefined`
  if (getNodeProp(identifier, 'optional') !== true) return text;
  return NEEDS_PARENS_BEFORE_UNION.has(type.type) ? `(${text}) | undefined` : `${text} | undefined`;
}
