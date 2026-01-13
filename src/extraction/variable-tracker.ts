import type { Visitor, ESTreeNode } from '../types.js';
import type {
  VariableInfo,
  VariableReference,
  VariableScope,
  VariableTrackerContext,
} from './types.js';
import { getReferenceType } from './reference-utils.js';

type DeclarationType = VariableInfo['declarationType'];

interface VariableDeclaratorNode {
  type: string;
  id: ESTreeNode;
  init?: ESTreeNode;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

interface VariableDeclarationNode {
  type: string;
  kind: 'const' | 'let' | 'var';
  declarations: VariableDeclaratorNode[];
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

interface FunctionLikeNode {
  type: string;
  params: ESTreeNode[];
  body: ESTreeNode;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

interface IdentifierNode {
  type: string;
  name: string;
  typeAnnotation?: ESTreeNode;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

interface PatternNode {
  type: string;
  properties?: Array<{ type?: string; key: ESTreeNode; value: ESTreeNode }>;
  elements?: Array<ESTreeNode | null>;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

/** Get child nodes to traverse from an ObjectPattern */
function getObjectPatternChildren(objPattern: PatternNode): ESTreeNode[] {
  const children: ESTreeNode[] = [];
  for (const prop of objPattern.properties ?? []) {
    if (prop.type === 'RestElement') {
      children.push((prop as ESTreeNode & { argument: ESTreeNode }).argument);
    } else {
      children.push(prop.value);
    }
  }
  return children;
}

/** Get child nodes to traverse from an ArrayPattern */
function getArrayPatternChildren(arrPattern: PatternNode): ESTreeNode[] {
  const children: ESTreeNode[] = [];
  for (const element of arrPattern.elements ?? []) {
    if (!element) continue;
    if (element.type === 'RestElement') {
      children.push((element as ESTreeNode & { argument: ESTreeNode }).argument);
    } else {
      children.push(element);
    }
  }
  return children;
}

interface TypeAnnotationNode {
  type: string;
  typeAnnotation?: ESTreeNode;
  loc?: ESTreeNode['loc'];
  parent?: ESTreeNode;
}

function getTypeAnnotation(node: ESTreeNode): string | undefined {
  const typed = node as TypeAnnotationNode;
  if (!typed.typeAnnotation) return undefined;

  const typeNode = typed.typeAnnotation as ESTreeNode & { typeAnnotation?: ESTreeNode };
  const actualType = typeNode.typeAnnotation ?? typeNode;

  if (actualType.type === 'TSTypeAnnotation') {
    const inner = (actualType as ESTreeNode & { typeAnnotation?: ESTreeNode }).typeAnnotation;
    if (inner) {
      return getTypeString(inner);
    }
  }

  return getTypeString(actualType);
}

// eslint-disable-next-line complexity/max-cyclomatic -- type mapping switch
function getTypeString(node: ESTreeNode): string {
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

function extractNamesFromPattern(
  pattern: ESTreeNode,
  declarationType: DeclarationType,
  typeAnnotation?: string
): Array<{ name: string; type: DeclarationType; typeAnnotation?: string }> {
  const results: Array<{ name: string; type: DeclarationType; typeAnnotation?: string }> = [];

  function traverse(node: ESTreeNode, currentType?: string): void {
    if (!node) return;

    switch (node.type) {
      case 'Identifier': {
        const id = node as IdentifierNode;
        const annotation = currentType ?? getTypeAnnotation(node);
        results.push({
          name: id.name,
          type: declarationType === 'destructured' ? 'destructured' : declarationType,
          typeAnnotation: annotation,
        });
        break;
      }
      case 'ObjectPattern':
        getObjectPatternChildren(node as PatternNode).forEach((child) => traverse(child));
        break;
      case 'ArrayPattern':
        getArrayPatternChildren(node as PatternNode).forEach((child) => traverse(child));
        break;
      case 'AssignmentPattern':
        traverse((node as ESTreeNode & { left: ESTreeNode }).left);
        break;
      case 'RestElement':
        traverse((node as ESTreeNode & { argument: ESTreeNode }).argument);
        break;
    }
  }

  traverse(pattern, typeAnnotation);
  return results;
}

function isInsideNestedFunction(node: ESTreeNode, trackedFunctionNode: ESTreeNode): boolean {
  let current = node.parent;
  while (current && current !== trackedFunctionNode) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/** Check if identifier is a variable declaration name */
function isDeclarationIdentifier(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (parent?.type !== 'VariableDeclarator') return false;
  return (parent as VariableDeclaratorNode).id === node;
}

/** Check if identifier is a function or class name */
function isFunctionOrClassName(node: ESTreeNode): boolean {
  const parent = node.parent;
  const isFuncOrClass =
    parent?.type === 'FunctionDeclaration' ||
    parent?.type === 'FunctionExpression' ||
    parent?.type === 'ClassDeclaration';
  if (!isFuncOrClass) return false;
  return (parent as ESTreeNode & { id?: ESTreeNode }).id === node;
}

/** Check if identifier is a non-computed, non-shorthand property key */
function isPropertyKey(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (parent?.type !== 'Property') return false;
  const prop = parent as ESTreeNode & { key: ESTreeNode; computed: boolean; shorthand: boolean };
  return prop.key === node && !prop.computed && !prop.shorthand;
}

/** Check if identifier is a non-computed member expression property */
function isMemberProperty(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (parent?.type !== 'MemberExpression') return false;
  const member = parent as ESTreeNode & { property: ESTreeNode; computed: boolean };
  return member.property === node && !member.computed;
}

/** Check if this identifier should be skipped for variable tracking */
function shouldSkipIdentifier(node: ESTreeNode, trackedFunctionNode: ESTreeNode): boolean {
  return (
    isDeclarationIdentifier(node) ||
    isFunctionOrClassName(node) ||
    isPropertyKey(node) ||
    isMemberProperty(node) ||
    isInsideNestedFunction(node, trackedFunctionNode)
  );
}

export function createVariableTracker(): {
  context: VariableTrackerContext;
  visitor: Partial<Visitor>;
  enterFunction: (node: ESTreeNode) => void;
  exitFunction: () => Map<string, VariableInfo>;
} {
  const variables: Map<string, VariableInfo> = new Map();
  const scopeStack: VariableScope[] = [];
  let trackedFunctionNode: ESTreeNode | null = null;

  function getCurrentScope(): VariableScope | undefined {
    return scopeStack[scopeStack.length - 1];
  }

  function getCurrentScopeLevel(): number {
    return scopeStack.length - 1;
  }

  function enterScope(node: ESTreeNode): void {
    const startLine = node.loc?.start.line ?? 0;
    const endLine = node.loc?.end.line ?? 0;

    scopeStack.push({
      node,
      variables: new Map(),
      startLine,
      endLine,
      level: scopeStack.length,
    });
  }

  function exitScope(): void {
    scopeStack.pop();
  }

  function declareVariable(
    name: string,
    info: Omit<VariableInfo, 'references' | 'scopeLevel'>
  ): void {
    const scope = getCurrentScope();
    if (!scope) return;

    const varInfo: VariableInfo = {
      ...info,
      references: [],
      scopeLevel: scope.level,
    };

    variables.set(name, varInfo);
    scope.variables.set(name, varInfo);
  }

  function addReference(
    name: string,
    ref: Omit<VariableReference, 'node'>,
    node: ESTreeNode
  ): void {
    const varInfo = variables.get(name);
    if (varInfo) {
      varInfo.references.push({
        ...ref,
        node,
      });
    }
  }

  function getVariablesInRange(startLine: number, endLine: number): VariableInfo[] {
    return Array.from(variables.values()).filter(
      (v) => v.declarationLine >= startLine && v.declarationLine <= endLine
    );
  }

  function getCapturedVariables(
    functionStartLine: number,
    functionEndLine: number
  ): VariableInfo[] {
    return Array.from(variables.values()).filter((v) => {
      // Variable must be declared before the nested function
      if (v.declarationLine >= functionStartLine) return false;

      // Check if any references are inside the nested function
      return v.references.some(
        (ref) => ref.line >= functionStartLine && ref.line <= functionEndLine
      );
    });
  }

  const context: VariableTrackerContext = {
    variables,
    scopeStack,
    getCurrentScope,
    getCurrentScopeLevel,
    declareVariable,
    addReference,
    getVariablesInRange,
    getCapturedVariables,
  };

  function enterFunction(node: ESTreeNode): void {
    trackedFunctionNode = node;
    variables.clear();
    scopeStack.length = 0;
    enterScope(node);

    // Track function parameters
    const funcNode = node as FunctionLikeNode;
    if (funcNode.params) {
      for (const param of funcNode.params) {
        const names = extractNamesFromPattern(param, 'param');
        for (const { name, typeAnnotation } of names) {
          declareVariable(name, {
            name,
            declarationLine: param.loc?.start.line ?? 0,
            declarationColumn: param.loc?.start.column ?? 0,
            declarationType: 'param',
            isMutable: true, // Parameters can be reassigned
            typeAnnotation,
          });
        }
      }
    }
  }

  function exitFunction(): Map<string, VariableInfo> {
    const result = new Map(variables);
    variables.clear();
    scopeStack.length = 0;
    trackedFunctionNode = null;
    return result;
  }

  const visitor: Partial<Visitor> = {
    BlockStatement(node: ESTreeNode): void {
      // Only create new scope for blocks that aren't the function body
      if (trackedFunctionNode && node.parent !== trackedFunctionNode) {
        enterScope(node);
      }
    },

    'BlockStatement:exit'(node: ESTreeNode): void {
      if (trackedFunctionNode && node.parent !== trackedFunctionNode) {
        exitScope();
      }
    },

    VariableDeclaration(node: ESTreeNode): void {
      const varDecl = node as VariableDeclarationNode;
      const isMutable = varDecl.kind !== 'const';

      for (const declarator of varDecl.declarations) {
        const names = extractNamesFromPattern(
          declarator.id,
          varDecl.kind === 'const' ? 'const' : varDecl.kind === 'let' ? 'let' : 'var'
        );

        for (const { name, type, typeAnnotation } of names) {
          declareVariable(name, {
            name,
            declarationLine: declarator.loc?.start.line ?? 0,
            declarationColumn: declarator.loc?.start.column ?? 0,
            declarationType: type,
            isMutable,
            typeAnnotation,
          });
        }
      }
    },

    Identifier(node: ESTreeNode): void {
      if (!trackedFunctionNode) return;
      if (shouldSkipIdentifier(node, trackedFunctionNode)) return;

      const refType = getReferenceType(node);
      if (!refType) return;

      const id = node as IdentifierNode;
      addReference(
        id.name,
        {
          line: node.loc?.start.line ?? 0,
          column: node.loc?.start.column ?? 0,
          type: refType,
        },
        node
      );
    },
  };

  return {
    context,
    visitor,
    enterFunction,
    exitFunction,
  };
}
