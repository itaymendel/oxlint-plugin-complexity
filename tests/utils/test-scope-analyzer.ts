/**
 * Simple scope analyzer for tests that mimics oxlint's scope manager.
 * This is needed because eslint-scope doesn't work with oxc-parser's AST.
 */

import { walk } from 'estree-walker';
import type { Node as EstreeWalkerNode } from 'estree-walker';
import type { ESTreeNode } from '#src/types.js';
import type { Scope, ScopeManager, Variable, Reference, Definition } from 'oxlint/plugins';

interface IdentifierNode extends ESTreeNode {
  name: string;
  typeAnnotation?: ESTreeNode;
}

interface VariableDeclarationNode extends ESTreeNode {
  kind: 'const' | 'let' | 'var';
  declarations: Array<{
    id: ESTreeNode;
    init?: ESTreeNode;
  }>;
}

interface FunctionNode extends ESTreeNode {
  params: ESTreeNode[];
  body: ESTreeNode;
  id?: IdentifierNode;
}

interface MutableScope {
  type: Scope['type'];
  isStrict: boolean;
  upper: MutableScope | null;
  childScopes: MutableScope[];
  variableScope: MutableScope;
  block: ESTreeNode;
  variables: MutableVariable[];
  set: Map<string, MutableVariable>;
  references: MutableReference[];
  through: MutableReference[];
  functionExpressionScope: boolean;
}

interface MutableVariable {
  name: string;
  scope: MutableScope;
  identifiers: IdentifierNode[];
  references: MutableReference[];
  defs: MutableDefinition[];
}

interface MutableReference {
  identifier: IdentifierNode;
  from: MutableScope;
  resolved: MutableVariable | null;
  writeExpr: ESTreeNode | null;
  init: boolean;
  isWrite(): boolean;
  isRead(): boolean;
  isReadOnly(): boolean;
  isWriteOnly(): boolean;
  isReadWrite(): boolean;
}

interface MutableDefinition {
  type: Definition['type'];
  name: IdentifierNode;
  node: ESTreeNode;
  parent: ESTreeNode | null;
}

function createScope(
  type: Scope['type'],
  block: ESTreeNode,
  upper: MutableScope | null
): MutableScope {
  const scope: MutableScope = {
    type,
    isStrict: false,
    upper,
    childScopes: [],
    variableScope: null as unknown as MutableScope,
    block,
    variables: [],
    set: new Map(),
    references: [],
    through: [],
    functionExpressionScope: false,
  };
  // For function and module scopes, variableScope is self
  scope.variableScope =
    type === 'function' || type === 'module' || type === 'global'
      ? scope
      : (upper?.variableScope ?? scope);
  return scope;
}

function createVariable(name: string, scope: MutableScope): MutableVariable {
  return {
    name,
    scope,
    identifiers: [],
    references: [],
    defs: [],
  };
}

function createReference(
  identifier: IdentifierNode,
  from: MutableScope,
  resolved: MutableVariable | null,
  isWriteRef: boolean,
  writeExpr: ESTreeNode | null = null,
  init: boolean = false
): MutableReference {
  const isReadRef =
    !isWriteRef || (writeExpr !== null && identifier.parent?.type === 'AssignmentExpression');

  return {
    identifier,
    from,
    resolved,
    writeExpr,
    init,
    isWrite: () => isWriteRef,
    isRead: () => isReadRef || !isWriteRef,
    isReadOnly: () => !isWriteRef,
    isWriteOnly: () => isWriteRef && !isReadRef,
    isReadWrite: () => isWriteRef && isReadRef,
  };
}

function extractNames(pattern: ESTreeNode): IdentifierNode[] {
  const names: IdentifierNode[] = [];

  function traverse(node: ESTreeNode): void {
    if (!node) return;

    switch (node.type) {
      case 'Identifier':
        names.push(node as IdentifierNode);
        break;
      case 'ObjectPattern': {
        const obj = node as ESTreeNode & {
          properties: Array<{ value: ESTreeNode; type: string; argument?: ESTreeNode }>;
        };
        for (const prop of obj.properties || []) {
          if (prop.type === 'RestElement' && prop.argument) {
            traverse(prop.argument);
          } else if (prop.value) {
            traverse(prop.value);
          }
        }
        break;
      }
      case 'ArrayPattern': {
        const arr = node as ESTreeNode & { elements: Array<ESTreeNode | null> };
        for (const elem of arr.elements || []) {
          if (elem) {
            if (elem.type === 'RestElement') {
              traverse((elem as ESTreeNode & { argument: ESTreeNode }).argument);
            } else {
              traverse(elem);
            }
          }
        }
        break;
      }
      case 'AssignmentPattern':
        traverse((node as ESTreeNode & { left: ESTreeNode }).left);
        break;
      case 'RestElement':
        traverse((node as ESTreeNode & { argument: ESTreeNode }).argument);
        break;
    }
  }

  traverse(pattern);
  return names;
}

function isWriteContext(node: ESTreeNode): {
  isWrite: boolean;
  writeExpr: ESTreeNode | null;
  init: boolean;
} {
  const parent = node.parent;
  if (!parent) return { isWrite: false, writeExpr: null, init: false };

  switch (parent.type) {
    case 'VariableDeclarator': {
      const decl = parent as ESTreeNode & { id: ESTreeNode; init?: ESTreeNode };
      if (isInPattern(node, decl.id)) {
        return { isWrite: true, writeExpr: decl.init ?? null, init: true };
      }
      return { isWrite: false, writeExpr: null, init: false };
    }
    case 'AssignmentExpression': {
      const assign = parent as ESTreeNode & {
        left: ESTreeNode;
        right: ESTreeNode;
        operator: string;
      };
      if (isInPattern(node, assign.left)) {
        return { isWrite: true, writeExpr: assign.right, init: false };
      }
      return { isWrite: false, writeExpr: null, init: false };
    }
    case 'UpdateExpression':
      return { isWrite: true, writeExpr: null, init: false };
    case 'ForInStatement':
    case 'ForOfStatement': {
      const forStmt = parent as ESTreeNode & { left: ESTreeNode };
      if (isInPattern(node, forStmt.left)) {
        return { isWrite: true, writeExpr: null, init: false };
      }
      return { isWrite: false, writeExpr: null, init: false };
    }
    default:
      return { isWrite: false, writeExpr: null, init: false };
  }
}

function isInPattern(node: ESTreeNode, pattern: ESTreeNode): boolean {
  if (node === pattern) return true;

  let current: ESTreeNode | undefined = node;
  while (current?.parent && current !== pattern) {
    current = current.parent;
    if (current === pattern) return true;
  }
  return false;
}

function shouldSkipIdentifier(node: ESTreeNode): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Skip property keys in object literals (non-shorthand)
  if (parent.type === 'Property') {
    const prop = parent as ESTreeNode & {
      key: ESTreeNode;
      shorthand?: boolean;
      computed?: boolean;
    };
    if (prop.key === node && !prop.shorthand && !prop.computed) {
      return true;
    }
  }

  // Skip non-computed member expression properties
  if (parent.type === 'MemberExpression') {
    const member = parent as ESTreeNode & { property: ESTreeNode; computed?: boolean };
    if (member.property === node && !member.computed) {
      return true;
    }
  }

  // Skip function/class names in declarations
  if (
    parent.type === 'FunctionDeclaration' ||
    parent.type === 'FunctionExpression' ||
    parent.type === 'ClassDeclaration'
  ) {
    const decl = parent as ESTreeNode & { id?: ESTreeNode };
    if (decl.id === node) {
      return true;
    }
  }

  // Skip variable declarator ids (these are handled as definitions, not references)
  if (parent.type === 'VariableDeclarator') {
    const decl = parent as ESTreeNode & { id: ESTreeNode };
    if (isInPattern(node, decl.id)) {
      return true;
    }
  }

  // Skip function parameters (these are handled as definitions)
  if (
    parent.type === 'FunctionDeclaration' ||
    parent.type === 'FunctionExpression' ||
    parent.type === 'ArrowFunctionExpression'
  ) {
    const func = parent as FunctionNode;
    if (func.params.some((p) => isInPattern(node, p))) {
      return true;
    }
  }

  return false;
}

/**
 * Analyze an AST and create a scope manager compatible with oxlint's interface.
 */
export function analyzeScope(ast: ESTreeNode): ScopeManager {
  const scopes: MutableScope[] = [];
  const nodeToScope = new Map<ESTreeNode, MutableScope>();
  let currentScope: MutableScope | null = null;

  // Create global/module scope
  const globalScope = createScope('module', ast, null);
  scopes.push(globalScope);
  nodeToScope.set(ast, globalScope);
  currentScope = globalScope;

  // First pass: create scopes and define variables
  walk(ast as EstreeWalkerNode, {
    enter(node, _parent) {
      const esNode = node as unknown as ESTreeNode;

      switch (esNode.type) {
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression': {
          const funcNode = esNode as FunctionNode;

          // Add function name to current scope (for FunctionDeclaration)
          if (esNode.type === 'FunctionDeclaration' && funcNode.id && currentScope) {
            let variable = currentScope.set.get(funcNode.id.name);
            if (!variable) {
              variable = createVariable(funcNode.id.name, currentScope);
              currentScope.variables.push(variable);
              currentScope.set.set(funcNode.id.name, variable);
            }
            variable.identifiers.push(funcNode.id);
            variable.defs.push({
              type: 'FunctionName',
              name: funcNode.id,
              node: esNode,
              parent: esNode.parent ?? null,
            });
          }

          // Create new function scope
          const funcScope = createScope('function', esNode, currentScope);
          scopes.push(funcScope);
          nodeToScope.set(esNode, funcScope);
          currentScope?.childScopes.push(funcScope);
          currentScope = funcScope;

          // Add parameters to function scope
          for (const param of funcNode.params) {
            const names = extractNames(param);
            for (const id of names) {
              let variable = currentScope.set.get(id.name);
              if (!variable) {
                variable = createVariable(id.name, currentScope);
                currentScope.variables.push(variable);
                currentScope.set.set(id.name, variable);
              }
              variable.identifiers.push(id);
              variable.defs.push({
                type: 'Parameter',
                name: id,
                node: param,
                parent: esNode,
              });
            }
          }
          break;
        }

        case 'BlockStatement': {
          // Don't create a new scope for function body blocks
          const parentType = esNode.parent?.type;
          if (
            parentType !== 'FunctionDeclaration' &&
            parentType !== 'FunctionExpression' &&
            parentType !== 'ArrowFunctionExpression'
          ) {
            const blockScope = createScope('block', esNode, currentScope);
            scopes.push(blockScope);
            nodeToScope.set(esNode, blockScope);
            currentScope?.childScopes.push(blockScope);
            currentScope = blockScope;
          }
          break;
        }

        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement': {
          const forScope = createScope('for', esNode, currentScope);
          scopes.push(forScope);
          nodeToScope.set(esNode, forScope);
          currentScope?.childScopes.push(forScope);
          currentScope = forScope;
          break;
        }

        case 'CatchClause': {
          const catchNode = esNode as ESTreeNode & { param?: ESTreeNode };
          const catchScope = createScope('catch', esNode, currentScope);
          scopes.push(catchScope);
          nodeToScope.set(esNode, catchScope);
          currentScope?.childScopes.push(catchScope);
          currentScope = catchScope;

          // Add catch parameter
          if (catchNode.param) {
            const names = extractNames(catchNode.param);
            for (const id of names) {
              const variable = createVariable(id.name, currentScope);
              currentScope.variables.push(variable);
              currentScope.set.set(id.name, variable);
              variable.identifiers.push(id);
              variable.defs.push({
                type: 'CatchClause',
                name: id,
                node: catchNode.param,
                parent: esNode,
              });
            }
          }
          break;
        }

        case 'VariableDeclaration': {
          const varDecl = esNode as VariableDeclarationNode;
          for (const declarator of varDecl.declarations) {
            const names = extractNames(declarator.id);
            for (const id of names) {
              // For 'var', add to function scope; for 'let'/'const', add to current block scope
              const targetScope =
                varDecl.kind === 'var'
                  ? (currentScope?.variableScope ?? currentScope)
                  : currentScope;

              if (!targetScope) continue;

              let variable = targetScope.set.get(id.name);
              if (!variable) {
                variable = createVariable(id.name, targetScope);
                targetScope.variables.push(variable);
                targetScope.set.set(id.name, variable);
              }
              variable.identifiers.push(id);
              variable.defs.push({
                type: 'Variable',
                name: id,
                node: declarator as unknown as ESTreeNode,
                parent: esNode,
              });
            }
          }
          break;
        }
      }
    },

    leave(node, _parent) {
      const esNode = node as unknown as ESTreeNode;

      switch (esNode.type) {
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'CatchClause':
          currentScope = currentScope?.upper ?? null;
          break;

        case 'BlockStatement': {
          const parentType = esNode.parent?.type;
          if (
            parentType !== 'FunctionDeclaration' &&
            parentType !== 'FunctionExpression' &&
            parentType !== 'ArrowFunctionExpression'
          ) {
            currentScope = currentScope?.upper ?? null;
          }
          break;
        }
      }
    },
  });

  // Second pass: collect references
  currentScope = globalScope;
  const scopeStack: MutableScope[] = [globalScope];

  walk(ast as EstreeWalkerNode, {
    enter(node, _parent) {
      const esNode = node as unknown as ESTreeNode;

      // Track scope changes
      const nodeScope = nodeToScope.get(esNode);
      if (nodeScope) {
        scopeStack.push(nodeScope);
        currentScope = nodeScope;
      }

      // Handle identifier references
      if (esNode.type === 'Identifier' && currentScope) {
        const id = esNode as IdentifierNode;

        if (shouldSkipIdentifier(esNode)) {
          return;
        }

        // Look up the variable in scope chain
        let resolved: MutableVariable | null = null;
        let searchScope: MutableScope | null = currentScope;
        while (searchScope && !resolved) {
          resolved = searchScope.set.get(id.name) ?? null;
          searchScope = searchScope.upper;
        }

        const writeCtx = isWriteContext(esNode);
        const ref = createReference(
          id,
          currentScope,
          resolved,
          writeCtx.isWrite,
          writeCtx.writeExpr,
          writeCtx.init
        );

        currentScope.references.push(ref);
        if (resolved) {
          resolved.references.push(ref);
        } else {
          // Through reference (unresolved)
          currentScope.through.push(ref);
        }
      }
    },

    leave(node, _parent) {
      const esNode = node as unknown as ESTreeNode;
      const nodeScope = nodeToScope.get(esNode);
      if (nodeScope) {
        scopeStack.pop();
        currentScope = scopeStack[scopeStack.length - 1] ?? null;
      }
    },
  });

  return {
    scopes: scopes as unknown as Scope[],
    globalScope: globalScope as unknown as Scope,
    getDeclaredVariables(node: ESTreeNode): Variable[] {
      const scope = nodeToScope.get(node);
      return scope ? (scope.variables as unknown as Variable[]) : [];
    },
    acquire(node: ESTreeNode, _inner?: boolean): Scope | null {
      return (nodeToScope.get(node) as unknown as Scope) ?? null;
    },
  } as ScopeManager;
}
