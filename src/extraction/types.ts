import type { ESTreeNode, ComplexityPoint } from '../types.js';

export type DeclarationType = 'const' | 'let' | 'var' | 'param' | 'destructured';
export type ReferenceType = 'read' | 'write' | 'readwrite';

export interface VariableInfo {
  name: string;
  declarationLine: number;
  declarationColumn: number;
  declarationType: DeclarationType;
  isMutable: boolean;
  typeAnnotation?: string;
  references: VariableReference[];
  scopeLevel: number;
}

export interface VariableReference {
  line: number;
  column: number;
  type: ReferenceType;
  node: ESTreeNode;
}

export interface ExtractionCandidate {
  startLine: number;
  endLine: number;
  complexity: number;
  complexityPercentage: number;
  points: ComplexityPoint[];
  constructs: string[];
}

export interface VariableFlowAnalysis {
  inputs: VariableInfo[];
  outputs: VariableInfo[];
  internalOnly: VariableInfo[];
  mutations: MutationInfo[];
  /** Set when the safety checks found a hazard; a signature is only printed without one */
  hazard?: ExtractionIssue;
  /** `Check types:` lines to print after a signature */
  typeNotes?: string[];
  /** True for any function-level `return` or escaping `break`/`continue`, even a replaceable one */
  hasEarlyReturn: boolean;
  /** True for `this`, `arguments`, `super` or `new.target` (also inside nested arrow functions) */
  hasThisReference: boolean;
  earlyExits?: EarlyExit[];
  asyncBoundaries?: AsyncBoundary[];
}

export interface EarlyExit {
  kind: 'return' | 'break' | 'continue';
  line: number;
  /** True when `return extracted(...)` at the call site is exact (tail or always-abrupt block) */
  replaceable: boolean;
  /** For returns: whether the `return` carries a value */
  hasArgument?: boolean;
  /** For labelled `break`/`continue`: the target label */
  label?: string;
}

export interface AsyncBoundary {
  kind: 'await' | 'yield';
  line: number;
}

export interface MutationInfo {
  variable: VariableInfo;
  mutationLine: number;
  mutationType: 'assignment' | 'increment' | 'method-call';
}

export interface ExtractionIssue {
  type:
    | 'mutation'
    | 'closure'
    | 'early-return'
    | 'too-many-params'
    | 'multiple-outputs'
    | 'this-reference'
    | 'unsafe-extraction';
  description: string;
  line?: number;
  variable?: string;
}

export interface TypedVariable {
  name: string;
  type?: string;
}

/**
 * Confidence level for an extraction suggestion.
 *
 * - `high`: 0-3 inputs, 0-1 outputs, no mutations, no hazard
 * - `medium`: 4-5 inputs OR 2 outputs OR early exits (`return`, escaping `break`/`continue`),
 *   `await`/`yield`, or `this`/`arguments`/`super`/`new.target`
 * - `low`: 6+ inputs OR 3+ outputs OR mutations OR a closure hazard
 */
export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractionSuggestion {
  range: {
    start: number;
    end: number;
  };
  complexity: number;
  complexityPercentage: number;
  confidence: ExtractionConfidence;
  inputs: TypedVariable[];
  outputs: TypedVariable[];
  suggestedSignature?: string;
  /** Lines to print after the signature, naming types to check; only set with a signature */
  typeNotes?: string[];
  issues: ExtractionIssue[];
  suggestions: string[];
}

export interface ExtractionOptions {
  /** @internal Name of the analyzed file, used to tell TypeScript from JavaScript. */
  filename?: string;
  minComplexityPercentage?: number;
  /** Maximum percentage of complexity for a candidate (default: 70) - rejects whole-function suggestions */
  maxComplexityPercentage?: number;
  /** @deprecated Ignored since 4.1.0; candidates are AST statements and blocks. */
  maxLineGap?: number;
  /** Maximum number of candidates to return (default: 3) */
  maxCandidates?: number;
  /** Minimum total complexity to trigger analysis (default: 150% of threshold) */
  minComplexityMultiplier?: number;
}
