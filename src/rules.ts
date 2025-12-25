import { defineRule } from 'oxlint';
import type {
  Rule,
  Context,
  Visitor,
  FunctionNode,
  ComplexityResult,
  VisitorWithHooks,
  ESTreeNode,
} from './types.js';
import { getFunctionName, summarizeComplexity } from './utils.js';
import { createCyclomaticVisitor } from './cyclomatic.js';
import { createCognitiveVisitor } from './cognitive/visitor.js';

/**
 * Configuration for creating a complexity rule.
 */
interface ComplexityRuleConfig {
  metricName: string;
  defaultMax: number;
  schemaMinimum: number;
  description: string;
  url: string;

  /** Factory to create the visitor */
  createVisitor: (
    context: Context,
    onComplexityCalculated: (result: ComplexityResult, node: ESTreeNode) => void
  ) => Visitor;

  normalizeCategory?: (category: string) => string;
}

function createComplexityRule(config: ComplexityRuleConfig): Rule {
  return defineRule({
    meta: {
      type: 'suggestion',
      docs: {
        description: config.description,
        recommended: false,
        url: config.url,
      },
      schema: [
        {
          type: 'object',
          properties: {
            max: {
              type: 'integer',
              minimum: config.schemaMinimum,
            },
          },
          additionalProperties: false,
        },
      ],
    },

    createOnce(context: Context) {
      let maxComplexity = config.defaultMax;

      return {
        before() {
          const options = (context.options[0] || {}) as { max?: number };
          maxComplexity = options.max ?? config.defaultMax;
        },

        ...config.createVisitor(context, (result, node) => {
          if (result.total > maxComplexity) {
            const funcNode = node as FunctionNode;
            const name = getFunctionName(funcNode, funcNode.parent);
            const summary = summarizeComplexity(result.points, config.normalizeCategory);

            context.report({
              node,
              message: `Function '${name}' has ${config.metricName} of ${result.total}. Maximum allowed is ${maxComplexity}.${summary}`,
            });
          }
        }),
      } as VisitorWithHooks;
    },
  });
}

function normalizeCognitiveCategory(category: string): string {
  if (category.startsWith('logical operator')) return 'logical operators';
  if (category.startsWith('nested ')) return 'nested functions';
  if (category.startsWith('break to') || category.startsWith('continue to')) return 'labeled jumps';
  return category;
}

/**
 * Enforce a maximum cyclomatic complexity for functions.
 * Default threshold: 20
 */
export const maxCyclomatic = createComplexityRule({
  metricName: 'cyclomatic complexity',
  defaultMax: 20,
  schemaMinimum: 1,
  description: 'Enforce a maximum cyclomatic complexity for functions',
  url: 'https://github.com/itaymendel/oxlint-plugin-complexity#complexitymax-cyclomatic',
  createVisitor: (_context, onComplexityCalculated) =>
    createCyclomaticVisitor(onComplexityCalculated),
});

/**
 * Enforce a maximum cognitive complexity for functions.
 * Default threshold: 15
 */
export const maxCognitive = createComplexityRule({
  metricName: 'Cognitive Complexity',
  defaultMax: 15,
  schemaMinimum: 0,
  description: 'Cognitive Complexity of functions should not be too high',
  url: 'https://github.com/itaymendel/oxlint-plugin-complexity#complexitymax-cognitive',
  createVisitor: createCognitiveVisitor,
  normalizeCategory: normalizeCognitiveCategory,
});
