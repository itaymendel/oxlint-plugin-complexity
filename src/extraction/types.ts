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
  closures: ClosureInfo[];
  hasEarlyReturn: boolean;
  hasThisReference: boolean;
}

export interface MutationInfo {
  variable: VariableInfo;
  mutationLine: number;
  mutationType: 'assignment' | 'increment' | 'method-call';
}

export interface ClosureInfo {
  variable: VariableInfo;
  closureStartLine: number;
  closureEndLine: number;
  issue: string;
}

export interface ExtractionIssue {
  type:
    | 'mutation'
    | 'closure'
    | 'early-return'
    | 'too-many-params'
    | 'multiple-outputs'
    | 'this-reference';
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
 * - `high`: 0-3 inputs, 0-1 outputs, no mutations, no closures
 * - `medium`: 4-5 inputs OR 2 outputs OR minor issues
 * - `low`: 6+ inputs OR 3+ outputs OR mutations OR closures
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
  issues: ExtractionIssue[];
  suggestions: string[];
}

export interface ExtractionOptions {
  minComplexityPercentage?: number;
  /** Maximum percentage of complexity for a candidate (default: 70) - rejects whole-function suggestions */
  maxComplexityPercentage?: number;
  /** Maximum line gap to consider points as contiguous (default: 2) */
  maxLineGap?: number;
  /** Maximum number of candidates to return (default: 3) */
  maxCandidates?: number;
  /** Minimum total complexity to trigger analysis (default: 150% of threshold) */
  minComplexityMultiplier?: number;
}
