/**
 * What the printed signature leaves to the reader to check in TypeScript: variables whose type
 * cannot be printed, and inputs whose type in the block may be narrower than the declared one.
 * These never withhold a signature.
 */
import type { Reference, Variable } from '@oxlint/plugins';
import type { ESTreeNode } from '../types.js';
import type { VariableInfo } from './types.js';
import { getNodeProp, isWrite } from './ast-utils.js';
import { annotationTypeNode } from './type-text.js';

export interface Binding {
  variable: Variable;
  info: VariableInfo;
}

const JAVASCRIPT_FILE = /\.[cm]?jsx?$/;

/** Unknown or missing file names (`.vue`, none) count as TypeScript. */
export function isTypeScriptFile(filename: string | undefined): boolean {
  return !JAVASCRIPT_FILE.test(filename ?? '');
}

/** Annotations of these kinds cannot be narrowed; a named type may be a union. */
const NON_NARROWING = new Set([
  'TSStringKeyword',
  'TSNumberKeyword',
  'TSBooleanKeyword',
  'TSBigIntKeyword',
  'TSSymbolKeyword',
  'TSAnyKeyword',
  'TSArrayType',
  'TSTupleType',
  'TSTypeLiteral',
  'TSFunctionType',
]);

const NON_UNION_GLOBALS = new Set(['Array', 'ReadonlyArray', 'Map', 'Set', 'Date', 'Promise']);

function couldNarrow(type: ESTreeNode): boolean {
  if (NON_NARROWING.has(type.type)) return false;
  const name = type.type === 'TSTypeReference' ? getNodeProp(type, 'typeName') : undefined;
  return !(name && NON_UNION_GLOBALS.has((name as { name?: string }).name ?? ''));
}

const TESTED_PROPERTY: Record<string, string> = {
  IfStatement: 'test',
  WhileStatement: 'test',
  DoWhileStatement: 'test',
  ForStatement: 'test',
  ConditionalExpression: 'test',
  SwitchStatement: 'discriminant',
  SwitchCase: 'test',
  LogicalExpression: 'left',
};

/** Whether a reference is a write, is tested by a condition, or sits in a call statement, which can narrow what follows. */
function narrowsAfter(ref: Reference): boolean {
  if (isWrite(ref)) return !ref.init;
  let child = ref.identifier as unknown as ESTreeNode;
  for (let parent = child.parent; parent; parent = parent.parent) {
    if (getNodeProp(parent, TESTED_PROPERTY[parent.type] ?? '') === child) return true;
    // A call statement may be an assertion
    if (parent.type === 'ExpressionStatement') return parent.expression.type === 'CallExpression';
    child = parent;
  }
  return false;
}

/** A declared union type may be narrowed by an initializer or by anything that ran before the block. */
function mayBeNarrowed({ variable, info }: Binding, blockStart: number): boolean {
  const type = annotationTypeNode(variable.identifiers[0] as unknown as ESTreeNode);
  return (
    info.typeAnnotation !== undefined &&
    !!type &&
    couldNarrow(type) &&
    variable.references.some(
      (ref) =>
        ref.init ||
        ((ref.identifier as unknown as ESTreeNode).start < blockStart && narrowsAfter(ref))
    )
  );
}

const namesOf = (bindings: Binding[]): string =>
  [...new Set(bindings.map((b) => b.variable.name))].join(', ');

/** One line per kind of type the reader should check; undefined when there is nothing to check. */
export function collectTypeNotes(
  inputs: Binding[],
  outputs: Binding[],
  blockStart: number
): string[] | undefined {
  const untyped = (b: Binding): boolean => b.info.typeAnnotation === undefined;
  const inferred = namesOf([...inputs, ...outputs].filter(untyped));
  const narrowed = namesOf(inputs.filter((b) => mayBeNarrowed(b, blockStart)));
  const lines: string[] = [];
  if (inferred) {
    const omitted = outputs.some(untyped) ? '; return type omitted' : '';
    lines.push(`Check types: ${inferred} (inferred${omitted})`);
  }
  if (narrowed) lines.push(`Check types: ${narrowed} (may be narrowed)`);
  return lines.length > 0 ? lines : undefined;
}
