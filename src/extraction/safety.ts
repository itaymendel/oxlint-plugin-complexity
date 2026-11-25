/**
 * Safety checks for extraction signatures.
 *
 * A signature is only printed when none of the rules below finds a hazard. The first rule that
 * finds one, or cannot decide, gives the block's one issue, naming the variable and line. This is
 * a conservative check of the code as written, not a proof: code run through getters, proxies, `eval` elsewhere or calls
 * the analysis cannot see into is not modeled. Everything is reasoned about by scope-manager
 * binding (`Variable`) and reference, never by name. The rules are blunt on purpose: when a case is
 * rare in real code, giving no signature is better than analyzing it precisely.
 *
 * Each rule is a small separate function so that tests can disable one at a time and show that every
 * rule is needed.
 */
import type { Reference, Scope, Variable } from '@oxlint/plugins';
import type { ESTreeNode } from '../types.js';
import type {
  ExtractionIssue,
  ExtractionOptions,
  VariableFlowAnalysis,
  VariableInfo,
} from './types.js';
import { isFunctionNode } from '../utils.js';
import {
  LOOP_STATEMENTS,
  getLine,
  getNodeProp,
  isNestedFunction,
  walkChildren,
  isWrite,
} from './ast-utils.js';
import type { UnitCandidate } from './unit-finder.js';
import { annotationTypeNode } from './type-text.js';
import { collectTypeNotes, isTypeScriptFile, type Binding } from './type-notes.js';

interface Region {
  start: number;
  /** Exclusive */
  end: number;
}

/** What is the same for every candidate of a function, so it is built once per function. */
export interface FunctionFacts {
  functionNode: ESTreeNode;
  functionScope: Scope;
  scopes: Scope[];
  byInfo: ReadonlyMap<VariableInfo, Variable>;
  typescript: boolean;
  /** Every reference of the function and its closures, by identifier node */
  refs: ReadonlyMap<unknown, Reference>;
  /** The first direct `eval` call or `with` statement, if any */
  dynamicName?: ESTreeNode;
}

interface SafetyContext extends FunctionFacts {
  region: Region;
  inputs: Binding[];
  outputs: Binding[];
  /** The parents of the unit's statements, up to and including the function node */
  ancestors: ESTreeNode[];
  /** The unit's statements */
  nodes: ESTreeNode[];
}

/** Returns the first hazard it finds, if any */
type SafetyRule = (context: SafetyContext) => ExtractionIssue | undefined;

const inRegion = (region: Region, pos: number): boolean => region.start <= pos && pos < region.end;

function collectScopes(scope: Scope, out: Scope[] = []): Scope[] {
  out.push(scope);
  for (const child of scope.childScopes) collectScopes(child, out);
  return out;
}

function findFunctionScope(
  variables: ReadonlyMap<unknown, VariableInfo>,
  functionNode: ESTreeNode
): Scope | null {
  for (const key of variables.keys()) {
    let scope: Scope | null = (key as Variable).scope ?? null;
    while (scope) {
      if (scope.block === functionNode && scope.type === 'function') return scope;
      scope = scope.upper;
    }
  }
  return null;
}

function ancestorsUpTo(functionNode: ESTreeNode, node: ESTreeNode): ESTreeNode[] {
  const chain: ESTreeNode[] = [];
  for (let n = node.parent; n; n = n.parent) {
    chain.push(n);
    if (n === functionNode) break;
  }
  return chain;
}

function declarationNode(v: Variable): ESTreeNode | undefined {
  return v.identifiers[0] as unknown as ESTreeNode | undefined;
}

/**
 * Where a binding counts as declared: its first declaring identifier, the same convention the flow
 * analysis uses. A `var` redeclared elsewhere is one binding; writes by the block to one declared
 * before it are reported as mutations.
 */
function declaredInRegion(region: Region, v: Variable): boolean {
  const node = declarationNode(v);
  return !!node && inRegion(region, node.start);
}

/** Module-level bindings are visible to a helper placed beside the function. */
function isProgramScope(scope: Scope | null): boolean {
  return (scope?.block as unknown as ESTreeNode | undefined)?.type === 'Program';
}

function isModuleLevel(v: Variable): boolean {
  if (isProgramScope(v.scope)) return true;
  // Inside its own class the name of a module-level class is a second binding of the same class
  const def = v.defs[0];
  return (
    v.scope.type === 'class' &&
    def?.type === 'ClassName' &&
    (def.node as ESTreeNode).type === 'ClassDeclaration' &&
    isProgramScope(v.scope.upper)
  );
}

const refNode = (ref: Reference): ESTreeNode => ref.identifier as unknown as ESTreeNode;
const refPos = (ref: Reference): number => refNode(ref).start;

function variableDeclaration(v: Variable): (ESTreeNode & { kind?: string }) | null {
  const def = v.defs[0];
  return def?.type === 'Variable' ? (def.parent as ESTreeNode | null) : null;
}

function unsafe(
  description: string,
  at: ESTreeNode | undefined,
  variable?: Variable
): ExtractionIssue {
  const line = at && getLine(at);
  return {
    type: 'unsafe-extraction',
    description,
    ...(line ? { line } : {}),
    ...(variable ? { variable: variable.name } : {}),
  };
}

/** Whether the program (or module) the scope sits in is strict. */
function isProgramStrict(scope: Scope): boolean {
  let program: Scope | null = scope;
  while (program && (program.block as unknown as ESTreeNode).type !== 'Program') {
    program = program.upper;
  }
  return !!program?.isStrict;
}

const changes = (ref: Reference): boolean => !ref.init && isWrite(ref);

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

/**
 * A helper works on copies: inputs are copied in, outputs are copied back. A closure that shares an
 * output, or an input that is a `var` or is ever written after its declaration, could see the
 * difference.
 */
const closure: SafetyRule = (context) => {
  for (const { variable: v } of [...context.inputs, ...context.outputs]) {
    const used = v.references.find((ref) => ref.from.variableScope !== v.scope.variableScope);
    if (!used) continue;
    // A parameter redeclared by `var` has the parameter definition first
    const mutable =
      context.outputs.some((b) => b.variable === v) ||
      v.defs.some((def) => (def.parent as { kind?: string } | null)?.kind === 'var') ||
      v.references.some(changes);
    if (mutable) {
      return {
        ...unsafe(
          `'${v.name}' is used by a closure and can change, which could see a different value than the helper's copy`,
          refNode(used),
          v
        ),
        type: 'closure',
      };
    }
  }
  return undefined;
};

/** Why a helper outside the function cannot see `v`, or null when it can. */
function unavailableReason(context: SafetyContext, v: Variable): string | null {
  if (v.identifiers.length === 0 || isModuleLevel(v)) return null;
  if (context.inputs.some((b) => b.variable === v) || declaredInRegion(context.region, v)) {
    return null;
  }
  // Bindings of an enclosing function: the nested-function issue already says so, once
  const outer = !context.scopes.includes(v.scope) && v.scope.type !== 'function-expression-name';
  if (outer && isNestedFunction(context.functionNode)) return null;
  const decl = declarationNode(v);
  if (decl && decl.start >= context.region.end) {
    return `'${v.name}' is used here but declared after the block (line ${getLine(decl)}), so the helper cannot see it`;
  }
  return `'${v.name}' is not available to a helper outside this function`;
}

/**
 * Every binding the block uses must be reachable from a helper at module level: declared inside the
 * block, at module level, or passed in as an input. A binding declared after the block (TDZ,
 * hoisted function), or a class or function-expression-name binding is not.
 */
const available: SafetyRule = (context) => {
  for (const ref of context.refs.values()) {
    if (!ref.resolved || !inRegion(context.region, refPos(ref))) continue;
    const reason = unavailableReason(context, ref.resolved);
    if (reason) return unsafe(reason, refNode(ref), ref.resolved);
  }
  return undefined;
};

/** A `let`, `const` or class declaration, which is in its temporal dead zone until it runs. */
function lexicalDeclaration(v: Variable): ESTreeNode | undefined {
  const def = v.defs[0];
  if (def?.type === 'ClassName') return def.node as ESTreeNode;
  const declaration = variableDeclaration(v);
  return declaration && declaration.kind !== 'var' ? declaration : undefined;
}

/**
 * An input is evaluated when the helper is called, so it must be initialized when the block is
 * reached. That is certain when its declaration sits in a list around the block (or is a loop
 * header around it); a declaration in an earlier switch case may not have run.
 */
const initialized: SafetyRule = (context) => {
  const late = context.inputs.find(({ variable }) => {
    const declaration = lexicalDeclaration(variable);
    return declaration && !context.ancestors.includes(declaration.parent as ESTreeNode);
  });
  return (
    late &&
    unsafe(
      `'${late.variable.name}' may not be initialized when the block is reached (a switch case can skip its declaration), so passing it to a helper could throw`,
      context.nodes[0],
      late.variable
    )
  );
};

/** What is wrong with a printed type: a name local to the function, or `this`. */
function typeProblem(context: SafetyContext, { variable, info }: Binding): string | undefined {
  const type = annotationTypeNode(declarationNode(variable) as ESTreeNode);
  if (!type) return undefined;
  const within = (node: unknown): boolean => inRegion(type, (node as ESTreeNode).start);
  // A name the type declares itself (`infer U`, a function type's generic) is fine
  const local = [...context.refs.values()].find(
    (ref) =>
      within(ref.identifier) &&
      ref.resolved &&
      !isModuleLevel(ref.resolved) &&
      !ref.resolved.identifiers.some(within)
  );
  if (local) return `uses '${local.identifier.name}', which is declared inside the function`;
  return /\bthis\b/.test(info.typeAnnotation ?? '')
    ? 'uses `this`, which a helper outside the class does not have'
    : undefined;
}

/** A printed type may only name things a helper at module level can see. */
const typeNames: SafetyRule = (context) => {
  for (const binding of [...context.inputs, ...context.outputs]) {
    if (binding.info.typeAnnotation === undefined) continue;
    const why = typeProblem(context, binding);
    if (why) {
      return unsafe(
        `The type of '${binding.variable.name}' ${why}`,
        declarationNode(binding.variable),
        binding.variable
      );
    }
  }
  return undefined;
};

/** Why a binding the block declares cannot be used outside it as the helper's result. */
function outsideUseProblem(
  context: SafetyContext,
  variable: Variable
): { why: string; at?: ESTreeNode } | undefined {
  if (variable.defs.length > 1) return { why: 'is declared in the block and more than once' };
  const outside = variable.references.find((ref) => !inRegion(context.region, refPos(ref)));
  if (!outside) return undefined;
  if (variable.defs[0]?.type === 'FunctionName') {
    return {
      why: 'is a function declaration used outside the block, which a helper cannot return',
    };
  }
  // Only an output read after the block gets the helper's value
  const isOutput = context.outputs.some((b) => b.variable === variable);
  const unreachable = isOutput
    ? variable.references.find((ref) => refPos(ref) < context.region.start)
    : outside;
  return (
    unreachable && {
      why: `is declared in the block but also used outside it (line ${getLine(refNode(unreachable))}), where the helper's value is not available`,
      at: refNode(unreachable),
    }
  );
}

/** A binding the block declares may be used outside it only as an output, after the block. */
const usedOutside: SafetyRule = (context) => {
  for (const variable of context.byInfo.values()) {
    if (!declaredInRegion(context.region, variable)) continue;
    const problem = outsideUseProblem(context, variable);
    if (problem) {
      return unsafe(
        `'${variable.name}' ${problem.why}`,
        problem.at ?? declarationNode(variable),
        variable
      );
    }
  }
  return undefined;
};

/** When the block throws, the helper returns nothing, so assignments made before the throw are lost. */
const inTry: SafetyRule = (context) => {
  const output = context.outputs[0];
  if (!output || !context.ancestors.some((n) => n.type === 'TryStatement')) return undefined;
  return unsafe(
    `'${output.variable.name}' is set by the block inside a try statement; if the block throws, the helper cannot return it`,
    declarationNode(output.variable),
    output.variable
  );
};

/** A `var` declared in a block inside a loop keeps its value across iterations. */
const loopVar: SafetyRule = (context) => {
  if (!context.ancestors.some((n) => LOOP_STATEMENTS.has(n.type))) return undefined;
  const v = [...context.byInfo.values()].find(
    (candidate) =>
      variableDeclaration(candidate)?.kind === 'var' && declaredInRegion(context.region, candidate)
  );
  return (
    v &&
    unsafe(
      `'var ${v.name}' is declared in a loop; it keeps its value across iterations but the helper starts fresh on every call`,
      declarationNode(v),
      v
    )
  );
};

/** The first node, in source order, that matches. */
function findNode(
  nodes: ESTreeNode[],
  matches: (n: ESTreeNode) => boolean
): ESTreeNode | undefined {
  let found: ESTreeNode | undefined;
  const visit = (n: ESTreeNode): void => {
    if (found) return;
    if (matches(n)) found = n;
    else walkChildren(n, visit);
  };
  nodes.forEach(visit);
  return found;
}

const isCallee = (n: ESTreeNode): boolean =>
  n.parent?.type === 'CallExpression' && n.parent.callee === (n as unknown);

/** Direct `eval` and `with` make every local reachable by name: no signature can be checked. */
function findDynamicName(scopes: Scope[], refs: Iterable<Reference>): ESTreeNode | undefined {
  const direct = [...refs].find((ref) => ref.identifier.name === 'eval' && isCallee(refNode(ref)));
  const withScope = scopes.find((scope) => scope.type === 'with');
  return (direct?.identifier ?? withScope?.block) as unknown as ESTreeNode | undefined;
}

const dynamic: SafetyRule = ({ dynamicName }) => {
  return (
    dynamicName &&
    unsafe(
      dynamicName.type === 'WithStatement'
        ? '`with` makes name resolution dynamic'
        : 'Direct eval can read any local variable by name',
      dynamicName
    )
  );
};

/** In sloppy mode a parameter and `arguments[i]` are one variable, and a block's function escapes it. */
const sloppy: SafetyRule = (context) => {
  if (context.functionScope.isStrict) return undefined;
  const usesArguments = !!context.functionScope.set.get('arguments')?.references.length;
  const aliased = [...context.inputs, ...context.outputs].find(
    ({ variable }) => usesArguments && variable.defs[0]?.type === 'Parameter'
  );
  if (aliased) {
    return unsafe(
      `'${aliased.variable.name}' is a parameter of a function that uses \`arguments\` in sloppy mode, where the two alias each other`,
      declarationNode(aliased.variable),
      aliased.variable
    );
  }
  const nested = findNode(
    context.nodes,
    (n) => n.type === 'FunctionDeclaration' && !isFunctionNode(n.parent?.parent as ESTreeNode)
  );
  return (
    nested &&
    unsafe(
      'A function is declared in a nested block; in sloppy mode it is visible outside that block, so moving it can change what outside code sees',
      nested
    )
  );
};

/** What strict mode can change: writes to properties and undeclared names, `delete`, plain functions. */
function isStrictSensitive(context: SafetyContext, n: ESTreeNode): boolean {
  switch (n.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return true;
    case 'AssignmentExpression':
      return !context.refs.get(getNodeProp(n, 'left'))?.resolved;
    case 'UpdateExpression':
      return (getNodeProp(n, 'argument') as ESTreeNode).type !== 'Identifier';
    case 'UnaryExpression':
      return getNodeProp(n, 'operator') === 'delete';
    case 'ForInStatement':
    case 'ForOfStatement':
      return (getNodeProp(n, 'left') as ESTreeNode).type !== 'VariableDeclaration';
    default:
      return false;
  }
}

/** A strict function's code would become sloppy in a helper at the top level of a sloppy script. */
const strict: SafetyRule = (context) => {
  const { functionScope } = context;
  if (!functionScope.isStrict || isProgramStrict(functionScope)) return undefined;
  const found = findNode(context.nodes, (n) => isStrictSensitive(context, n));
  return (
    found &&
    unsafe(
      'The function is strict (a class body or "use strict") but a helper at the top level of this script would be sloppy, where assignments and nested functions can behave differently',
      found
    )
  );
};

/** `#private` names only exist inside their class body, and `using` cannot be moved or run everywhere. */
const syntax: SafetyRule = (context) => {
  const found = findNode(
    context.nodes,
    (n) =>
      n.type === 'PrivateIdentifier' ||
      (n.type === 'VariableDeclaration' && String(getNodeProp(n, 'kind')).includes('using'))
  );
  return (
    found &&
    unsafe(
      found.type === 'PrivateIdentifier'
        ? '`#private` members are only accessible inside their class'
        : '`using` disposes the value at the end of its block, which moving it would change',
      found
    )
  );
};

/** In order: the first rule that finds a hazard gives the block's issue. */
export const SAFETY_RULES: Record<string, SafetyRule> = {
  closure,
  available,
  initialized,
  'type-names': typeNames,
  'used-outside': usedOutside,
  try: inTry,
  'loop-var': loopVar,
  dynamic,
  sloppy,
  strict,
  syntax,
};

const UNCHECKED: ExtractionIssue = {
  type: 'unsafe-extraction',
  description: 'Scope information is unavailable, so the extraction cannot be checked',
};

/** Null when scope information is unavailable. */
export function collectFunctionFacts(
  variables: ReadonlyMap<unknown, VariableInfo>,
  functionNode: ESTreeNode,
  options?: Pick<ExtractionOptions, 'filename'>
): FunctionFacts | null {
  const byInfo = new Map<VariableInfo, Variable>();
  for (const [key, info] of variables) {
    if (key && typeof key === 'object' && 'references' in key) byInfo.set(info, key as Variable);
  }
  const functionScope = findFunctionScope(variables, functionNode);
  if (byInfo.size !== variables.size || !functionScope) return null;

  const scopes = collectScopes(functionScope);
  const refs = new Map(
    scopes.flatMap((scope) => scope.references).map((ref) => [ref.identifier as unknown, ref])
  );
  return {
    functionNode,
    functionScope,
    scopes,
    byInfo,
    typescript: isTypeScriptFile(options?.filename),
    refs,
    dynamicName: findDynamicName(scopes, refs.values()),
  };
}

/**
 * Run the rules in order and stop at the first hazard; no hazard means no rule found one.
 */
export function checkExtractionSafety(
  candidate: UnitCandidate,
  flow: Pick<VariableFlowAnalysis, 'inputs' | 'outputs'>,
  facts: FunctionFacts | null
): Pick<VariableFlowAnalysis, 'hazard' | 'typeNotes'> {
  const nodes = candidate.unit?.nodes;
  if (!facts || !nodes?.length) return { hazard: UNCHECKED };

  const toBindings = (infos: VariableInfo[]): Binding[] =>
    infos.flatMap((info) => {
      const variable = facts.byInfo.get(info);
      return variable ? [{ info, variable }] : [];
    });
  const context: SafetyContext = {
    ...facts,
    region: { start: nodes[0].start, end: nodes[nodes.length - 1].end },
    inputs: toBindings(flow.inputs),
    outputs: toBindings(flow.outputs),
    ancestors: ancestorsUpTo(facts.functionNode, nodes[0]),
    nodes,
  };

  for (const rule of Object.values(SAFETY_RULES)) {
    const hazard = rule(context);
    if (hazard) return { hazard };
  }
  // Notes are printed only with a signature
  return facts.typescript
    ? { typeNotes: collectTypeNotes(context.inputs, context.outputs, context.region.start) }
    : {};
}
