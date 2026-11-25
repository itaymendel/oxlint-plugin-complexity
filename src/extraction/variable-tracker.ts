import type { Context, ESTreeNode } from '../types.js';
import type { VariableInfo, VariableReference, ReferenceType } from './types.js';
import type { Scope, Variable, Reference } from '@oxlint/plugins';
import { printDeclaredType } from './type-text.js';
import { writeThroughWrapper } from './ast-utils.js';

interface IdentifierNode {
  type: string;
  name?: string;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

const DESTRUCTURING_PATTERN_TYPES = new Set(['ObjectPattern', 'ArrayPattern']);

function isDestructuringPattern(parent: ESTreeNode | undefined): boolean {
  return (
    DESTRUCTURING_PATTERN_TYPES.has(parent?.type ?? '') ||
    DESTRUCTURING_PATTERN_TYPES.has(parent?.parent?.type ?? '')
  );
}

function mapVariableDefinitionType(
  def: { type: string; parent: ESTreeNode | null },
  variable: Variable
): VariableInfo['declarationType'] {
  const firstIdentifier = variable.identifiers[0] as IdentifierNode | undefined;
  if (isDestructuringPattern(firstIdentifier?.parent)) {
    return 'destructured';
  }
  const declParent = def.parent as ESTreeNode & { kind?: string };
  if (declParent?.kind === 'const') return 'const';
  if (declParent?.kind === 'let') return 'let';
  return 'var';
}

/**
 * Map oxlint DefinitionType to our declarationType.
 */
function mapDefinitionType(
  def: { type: string; parent: ESTreeNode | null },
  variable: Variable
): VariableInfo['declarationType'] {
  switch (def.type) {
    case 'Parameter':
    case 'CatchClause':
      return 'param';
    case 'Variable':
      return mapVariableDefinitionType(def, variable);
    case 'ImportBinding':
    case 'ClassName':
    case 'FunctionName':
      return 'const';
    default:
      return 'var';
  }
}

/**
 * Convert an oxlint Reference to our reference type.
 */
function getReferenceType(ref: Reference): ReferenceType | null {
  // `(x satisfies T) = 1` is reported as a read by the scope manager, but it writes x
  const through = writeThroughWrapper(ref.identifier as unknown as ESTreeNode);
  if (through) return through;
  if (ref.isReadWrite()) return 'readwrite';
  if (ref.isWrite()) return 'write';
  if (ref.isRead()) return 'read';
  return null;
}

/**
 * Calculate scope level relative to the function scope.
 */
function calculateScopeLevel(scope: Scope, functionScope: Scope): number {
  let level = 0;
  let current: Scope | null = scope;
  while (current && current !== functionScope) {
    level++;
    current = current.upper;
  }
  return level;
}

/** Scope types that only exist in the type system; oxlint reports `functionType` at runtime. */
const TYPE_ONLY_SCOPE_TYPES = new Set<string>(['functionType']);

const NESTED_FUNCTION_SCOPE_TYPES = new Set([
  'function',
  'function-expression-name',
  'class-field-initializer',
]);

/**
 * Check if a scope is inside a nested function (not the main function scope).
 */
function isNestedFunctionScope(scope: Scope, functionScope: Scope): boolean {
  if (scope === functionScope) return false;

  let current: Scope | null = scope;
  while (current && current !== functionScope) {
    if (NESTED_FUNCTION_SCOPE_TYPES.has(current.type)) {
      return true;
    }
    current = current.upper;
  }
  return false;
}

/**
 * Convert oxlint references to our VariableReference format.
 */
function convertReferences(variable: Variable): VariableReference[] {
  const references: VariableReference[] = [];

  for (const ref of variable.references) {
    const refType = getReferenceType(ref);
    if (!refType) continue;

    const identifier = ref.identifier as IdentifierNode;
    references.push({
      line: identifier.loc?.start.line ?? 0,
      column: identifier.loc?.start.column ?? 0,
      type: refType,
      node: ref.identifier as unknown as ESTreeNode,
    });
  }

  return references;
}

/**
 * Process a single variable and add it to the collected map.
 */
function processVariable(
  variable: Variable,
  scope: Scope,
  functionScope: Scope,
  collected: Map<Variable, VariableInfo>,
  source: string
): void {
  if (collected.has(variable)) return;

  const def = variable.defs[0];
  if (!def) return;
  // Type-only bindings (`type`, `interface`, type parameters) are not values
  if (variable.defs.every((d) => (d.type as string) === 'Type')) return;

  const identifier = variable.identifiers[0] as IdentifierNode | undefined;
  const defNode = def.node as ESTreeNode;
  const declarationType = mapDefinitionType(def, variable);

  collected.set(variable, {
    name: variable.name,
    declarationLine: defNode.loc?.start.line ?? 0,
    declarationColumn: defNode.loc?.start.column ?? 0,
    declarationType,
    isMutable: declarationType !== 'const',
    typeAnnotation: identifier ? printDeclaredType(source, identifier as ESTreeNode) : undefined,
    references: convertReferences(variable),
    scopeLevel: calculateScopeLevel(scope, functionScope),
  });
}

/**
 * Collect all variables from a scope and its non-function child scopes.
 */
function collectScopeVariables(
  scope: Scope,
  functionScope: Scope,
  collected: Map<Variable, VariableInfo>,
  source: string
): void {
  if (isNestedFunctionScope(scope, functionScope)) {
    return;
  }

  // Parameter names inside a function *type* (`(a: number) => void`) are not bindings of the
  // enclosing function: nothing can read, write or capture them.
  if (!TYPE_ONLY_SCOPE_TYPES.has(scope.type)) {
    for (const variable of scope.variables) {
      processVariable(variable, scope, functionScope, collected, source);
    }
  }

  for (const childScope of scope.childScopes) {
    collectScopeVariables(childScope, functionScope, collected, source);
  }
}

/**
 * Get all variables tracked within a function using oxlint's scope manager.
 *
 * This collects variables from the function scope and all nested block scopes,
 * but excludes variables from nested function scopes.
 *
 * Keyed by scope-manager `Variable` identity, never by name: same-named siblings, shadowed
 * parameters and function-type parameter names are different bindings.
 */
export function getVariablesForFunction(
  context: Context,
  functionNode: ESTreeNode
): Map<Variable, VariableInfo> {
  const variables = new Map<Variable, VariableInfo>();

  const functionScope = context.sourceCode.getScope(functionNode);
  if (!functionScope) {
    return variables;
  }

  collectScopeVariables(functionScope, functionScope, variables, context.sourceCode.text ?? '');

  return variables;
}
