import type { Context, ESTreeNode } from '../types.js';
import type { VariableInfo, VariableReference, ReferenceType } from './types.js';
import type { Scope, Variable, Reference } from 'oxlint';

interface IdentifierNode {
  type: string;
  name?: string;
  typeAnnotation?: ESTreeNode;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

/**
 * Extract TypeScript type annotation string from an identifier node.
 */
export function getTypeAnnotation(node: ESTreeNode): string | undefined {
  const typed = node as IdentifierNode;
  if (!typed.typeAnnotation) return undefined;

  const typeNode = typed.typeAnnotation as ESTreeNode & { typeAnnotation?: ESTreeNode };
  const actualType = typeNode.typeAnnotation ?? typeNode;

  if (actualType.type === 'TSTypeAnnotation' && actualType.typeAnnotation) {
    return getTypeString(actualType.typeAnnotation);
  }

  return getTypeString(actualType);
}

/**
 * Convert a TypeScript type node to a human-readable string.
 */
// eslint-disable-next-line complexity/max-cyclomatic -- type mapping switch
export function getTypeString(node: ESTreeNode): string {
  switch (node.type) {
    case 'TSStringKeyword':
      return 'string';
    case 'TSNumberKeyword':
      return 'number';
    case 'TSBooleanKeyword':
      return 'boolean';
    case 'TSAnyKeyword':
      return 'any';
    case 'TSVoidKeyword':
      return 'void';
    case 'TSNullKeyword':
      return 'null';
    case 'TSUndefinedKeyword':
      return 'undefined';
    case 'TSArrayType': {
      const arrayType = node as ESTreeNode & { elementType: ESTreeNode };
      return `${getTypeString(arrayType.elementType)}[]`;
    }
    case 'TSTypeReference': {
      const typeRef = node as ESTreeNode & { typeName: IdentifierNode };
      return typeRef.typeName?.name ?? 'unknown';
    }
    case 'TSUnionType': {
      const unionType = node as ESTreeNode & { types: ESTreeNode[] };
      return unionType.types.map(getTypeString).join(' | ');
    }
    case 'TSIntersectionType': {
      const intersectionType = node as ESTreeNode & { types: ESTreeNode[] };
      return intersectionType.types.map(getTypeString).join(' & ');
    }
    default:
      return 'unknown';
  }
}

const DESTRUCTURING_PATTERN_TYPES = new Set(['ObjectPattern', 'ArrayPattern']);

function isDestructuringPattern(parent: ESTreeNode | undefined): boolean {
  return (
    DESTRUCTURING_PATTERN_TYPES.has(parent?.type ?? '') ||
    DESTRUCTURING_PATTERN_TYPES.has(parent?.parent?.type ?? '')
  );
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
    case 'Variable': {
      const firstIdentifier = variable.identifiers[0] as IdentifierNode | undefined;
      if (isDestructuringPattern(firstIdentifier?.parent)) {
        return 'destructured';
      }
      const declParent = def.parent as ESTreeNode & { kind?: string };
      if (declParent?.kind === 'const') return 'const';
      if (declParent?.kind === 'let') return 'let';
      return 'var';
    }
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
function convertReferences(variable: Variable, functionScope: Scope): VariableReference[] {
  const references: VariableReference[] = [];

  for (const ref of variable.references) {
    const refType = getReferenceType(ref);
    if (!refType) continue;
    if (isNestedFunctionScope(ref.from, functionScope)) continue;

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
  collected: Map<string, VariableInfo>
): void {
  if (collected.has(variable.name)) return;

  const def = variable.defs[0];
  if (!def) return;

  const identifier = variable.identifiers[0] as IdentifierNode | undefined;
  const defNode = def.node as ESTreeNode;
  const declarationType = mapDefinitionType(def, variable);

  collected.set(variable.name, {
    name: variable.name,
    declarationLine: defNode.loc?.start.line ?? 0,
    declarationColumn: defNode.loc?.start.column ?? 0,
    declarationType,
    isMutable: declarationType !== 'const',
    typeAnnotation: identifier ? getTypeAnnotation(identifier as ESTreeNode) : undefined,
    references: convertReferences(variable, functionScope),
    scopeLevel: calculateScopeLevel(scope, functionScope),
  });
}

/**
 * Collect all variables from a scope and its non-function child scopes.
 */
function collectScopeVariables(
  scope: Scope,
  functionScope: Scope,
  collected: Map<string, VariableInfo>
): void {
  if (isNestedFunctionScope(scope, functionScope)) {
    return;
  }

  for (const variable of scope.variables) {
    processVariable(variable, scope, functionScope, collected);
  }

  for (const childScope of scope.childScopes) {
    collectScopeVariables(childScope, functionScope, collected);
  }
}

/**
 * Get all variables tracked within a function using oxlint's scope manager.
 *
 * This collects variables from the function scope and all nested block scopes,
 * but excludes variables from nested function scopes.
 */
export function getVariablesForFunction(
  context: Context,
  functionNode: ESTreeNode
): Map<string, VariableInfo> {
  const variables = new Map<string, VariableInfo>();

  const functionScope = context.sourceCode.getScope(functionNode);
  if (!functionScope) {
    return variables;
  }

  collectScopeVariables(functionScope, functionScope, variables);

  return variables;
}
