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

describe('complexity rule cognitive regressions', () => {
  it('does not report a branch-free Jest suite even with a cognitive limit of zero (#165)', () => {
    const tests = Array.from(
      'abcdefghijklmnopqrstuvwxyz',
      (letter) => `it('${letter}', () => {});`
    );
    const code = `describe('isALetter', () => {\n${tests.join('\n')}\n});`;
    expect(lint(code, { cognitive: 0, minLines: 0 })).toEqual([]);
    const { functions } = analyzeFileComplexity(code, 'test.ts');
    expect(functions).toHaveLength(27);
    for (const fn of functions) {
      expect(fn.cognitive).toBe(0);
      expect(fn.cognitivePoints).toEqual([]);
      expect(fn.cyclomatic).toBe(1);
    }
  });

  it('reports callback complexity separately from its enclosing function (#165)', () => {
    const code = `export function outer(xs: number[], a: boolean) {
  if (a) {
    xs.forEach((x) => {
      if (x > 1) {
        if (x > 2) {
          console.log(x);
        }
      }
    });
  }
}`;
    const messages = lint(code, {
      cognitive: 0,
      cyclomatic: 100,
      minLines: 0,
      enableExtraction: false,
    });
    expect(messages).toEqual([
      expect.stringContaining("Function '<arrow>' has Cognitive Complexity of 7."),
      expect.stringContaining("Function 'outer' has Cognitive Complexity of 1."),
    ]);
    expect(messages[0]).toContain("Line 4: +3 for 'if' (incl. +2 nesting)");
    expect(messages[0]).toContain("Line 5: +4 for 'if' (incl. +3 nesting)");
    expect(messages.join('\n')).not.toContain('nested function');
    expect(messages.join('\n')).not.toContain('nested arrow function');
    expect(
      analyzeFileComplexity(code, 'test.ts').functions.map(({ name, cognitive, cyclomatic }) => ({
        name,
        cognitive,
        cyclomatic,
      }))
    ).toEqual([
      { name: 'anonymous_1', cognitive: 7, cyclomatic: 3 },
      { name: 'outer', cognitive: 1, cyclomatic: 2 },
    ]);
  });

  it.each([
    {
      name: 'nested ternary in the consequent',
      body: 'return a ? (b ? 1 : 2) : 3;',
      score: 3,
    },
    {
      name: 'nested ternary in the alternate',
      body: 'return a ? 1 : (b ? 2 : 3);',
      score: 3,
    },
    {
      name: 'nested ternaries in both branches',
      body: 'return a ? (b ? 1 : 2) : (b ? 3 : 4);',
      score: 5,
    },
    {
      name: 'nesting unwinds before the next statement',
      body: 'const n = a ? (b ? 1 : 2) : 3; if (a) return n;',
      score: 4,
    },
  ])('$name', ({ body, score }) => {
    const messages = lint(`function example(a, b) { ${body} }`, {
      cognitive: 0,
      cyclomatic: 100,
      minLines: 0,
      enableExtraction: false,
    });
    expect(messages).toEqual([
      expect.stringContaining(`Function 'example' has Cognitive Complexity of ${score}.`),
    ]);
  });

  it('reports recursion once at the first call before later decisions', () => {
    const code = `function recurse(n) {
  recurse(n - 1);
  recurse(n - 2);
  if (n) return n;
}`;
    const messages = lint(code, {
      cognitive: 0,
      cyclomatic: 100,
      minLines: 0,
      enableExtraction: false,
    });
    expect(messages).toEqual([
      expect.stringContaining("Function 'recurse' has Cognitive Complexity of 2."),
    ]);
    expect(messages[0]).toContain("Line 2: +1 for 'recursive call'");
    expect(messages[0]).not.toContain('Line 3:');
    expect(messages[0]).toContain("Line 4: +1 for 'if'");
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
