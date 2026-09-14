import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { complexity } from '#src/rules/complexity.js';
import { analyzeFileComplexity } from '#src/standalone.js';
import { createMockContext, walkWithVisitor } from './utils/test-helpers.js';
import type { Context, ESTreeNode, VisitorWithHooks } from '#src/types.js';

/**
 * Drives the `complexity/complexity` rule end-to-end (createOnce -> before -> visitor)
 * and captures `context.report` messages. Covers class field initializers and static
 * blocks as reporting units, and the `minLines` interplay with one-line initializers.
 */
function lint(code: string, options: Record<string, unknown>): string[] {
  const messages: string[] = [];
  const context = {
    ...createMockContext(),
    options: [options],
    report: ({ message }: { message: string }) => {
      messages.push(message);
    },
  } as Context;

  const visitor = complexity.createOnce!(context) as VisitorWithHooks;
  visitor.before?.();

  const { program, errors } = parseSync('test.ts', code);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join(', '));
  }
  walkWithVisitor(program as unknown as ESTreeNode, visitor, code);
  visitor.after?.();

  return messages;
}

const classCode = `
class Config {
  mode = isProd ? 'prod' : 'dev';

  multiLine =
    flagA ||
    flagB ||
    flagC;

  static {
    if (isProd) {
      Config.ready = true;
    }
  }

  method(p = 1) {
    return p?.value;
  }
}
`;

describe('complexity rule reporting for class members', () => {
  it('reports field initializers, static blocks and methods with minLines disabled', () => {
    const messages = lint(classCode, { cyclomatic: 1, minLines: 0 });

    expect(messages).toEqual([
      expect.stringContaining("Function 'mode' has cyclomatic complexity of 2"),
      expect.stringContaining("Function 'multiLine' has cyclomatic complexity of 3"),
      expect.stringContaining("Function '<static block>' has cyclomatic complexity of 2"),
      expect.stringContaining("Function 'method' has cyclomatic complexity of 3"),
    ]);
  });

  it('skips one-line initializers under the default minLines but keeps longer units', () => {
    const messages = lint(classCode, { cyclomatic: 1, minLines: 4 });

    expect(messages).toEqual([
      expect.stringContaining("Function 'multiLine'"),
      expect.stringContaining("Function '<static block>'"),
    ]);
  });

  it('attributes decorator arguments and computed keys to the enclosing scope', () => {
    const code = `
      function outer(a, b) {
        class Inner {
          @dec(a ?? b) field = 1;
          [a ? 'x' : 'y'] = 2;
        }
        return Inner;
      }
    `;
    const messages = lint(code, { cyclomatic: 1, minLines: 0 });

    // `field` and the computed-key field are 1 each (not reported); `outer` gets the ?? and ternary
    expect(messages).toEqual([
      expect.stringContaining("Function 'outer' has cyclomatic complexity of 3"),
    ]);
  });

  it('does not attribute class member complexity to the enclosing function', () => {
    const code = `
      function outer(flag) {
        class Inner {
          field = flag || 0;
          static {
            if (flag) {
              Inner.ready = true;
            }
          }
        }
        return new Inner();
      }
    `;
    const messages = lint(code, { cyclomatic: 1, minLines: 0 });

    expect(messages).toEqual([
      expect.stringContaining("Function 'field' has cyclomatic complexity of 2"),
      expect.stringContaining("Function '<static block>' has cyclomatic complexity of 2"),
    ]);
  });
});

describe('standalone API point locations', () => {
  it('records the else point on a line, not at the default location', () => {
    const code = `
      function f(a) {
        if (a) {
          return 1;
        } else {
          return 2;
        }
      }
    `;
    const [fn] = analyzeFileComplexity(code, 'x.js').functions;
    const elsePoint = fn.cognitivePoints.find((p) => p.message.endsWith('else'));

    expect(elsePoint?.location.start.line).toBe(3);
  });
});
