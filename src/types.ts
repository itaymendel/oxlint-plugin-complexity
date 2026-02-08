import type { ESTree } from 'oxlint/plugins';

export type { Rule, Context, Visitor, VisitorWithHooks, Plugin } from 'oxlint/plugins';

export type ESTreeNode = ESTree.Node;
export type FunctionNode =
  | ESTree.Function
  | ESTree.ArrowFunctionExpression
  | ESTree.MethodDefinition;

export type LogicalExpressionNode = ESTree.LogicalExpression;
export type ConditionalExpressionNode = ESTree.ConditionalExpression;
export type CallExpressionNode = ESTree.CallExpression;
export type AssignmentExpressionNode = ESTree.AssignmentExpression;

export type IfStatementNode = ESTree.IfStatement;
export type SwitchStatementNode = ESTree.SwitchStatement;
export type SwitchCaseNode = ESTree.SwitchCase;

export type LabeledJumpStatementNode = ESTree.BreakStatement | ESTree.ContinueStatement;

export type CatchClauseNode = ESTree.CatchClause;

export interface ComplexityPoint {
  complexity: number;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  message: string;
}

export interface ComplexityResult {
  total: number;
  points: ComplexityPoint[];
}

export interface FunctionScope {
  node: ESTreeNode;
  name: string | null;
  points: ComplexityPoint[];
}

export interface MaxCyclomaticOptions {
  max?: number;
}

export interface MaxCognitiveOptions {
  max?: number;
  enableExtraction?: boolean;
  extractionMultiplier?: number;
  minExtractionPercentage?: number;
  nestingTipThreshold?: number;
  elseIfChainThreshold?: number;
  logicalOperatorThreshold?: number;
}
