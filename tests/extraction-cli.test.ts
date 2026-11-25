import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { formatExtractionSuggestions } from '#src/extraction/index.js';
import { analyze } from './utils/real-scopes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tscBin = join(root, 'node_modules', '.bin', 'tsc');
const oxlintBin = join(root, 'node_modules', '.bin', 'oxlint');

const NESTED = `function outer(items, limit) {
  let total = 0;
  const inner = (list) => {
    let m = 0;
    for (const x of list) {
      if (x) {
        if (x.y) {
          while (m < limit) {
            m += 1;
          }
        }
      }
    }
    return m;
  };
  for (const item of items) {
    if (item.a) {
      if (item.b) {
        total += inner(item.b);
      }
    }
  }
  return total;
}
`;

interface Diagnostic {
  message: string;
  filename: string;
  labels: Array<{ span: { offset: number; length: number; line: number } }>;
}

/** Line of a UTF-8 byte offset (1-based). */
function lineAt(source: Buffer, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (source[i] === 0x0a) line++;
  return line;
}

describe('scope harness matches the production CLI', () => {
  it('gives the same line ranges, inputs and Suggested signatures as real oxlint', () => {
    // Build the plugin from the current sources into a private directory (inside the repo's
    // node_modules, so its dependencies resolve), so a stale or missing dist/ can never be what
    // is compared against.
    const buildDir = mkdtempSync(join(root, 'node_modules', '.harness-cli-build-'));
    const distEntry = join(buildDir, 'index.js');
    execFileSync(
      tscBin,
      [
        '-p',
        join(root, 'tsconfig.json'),
        '--outDir',
        buildDir,
        '--declaration',
        'false',
        '--declarationMap',
        'false',
        '--sourceMap',
        'false',
      ],
      { cwd: root, stdio: 'pipe' }
    );
    expect(existsSync(distEntry), 'tsc did not produce index.js').toBe(true);

    const dir = mkdtempSync(join(tmpdir(), 'harness-cli-'));
    try {
      const files = new Map<string, string>();
      for (const lang of ['js', 'ts', 'jsx', 'tsx']) {
        const fixtureDir = join(root, 'tests', 'fixtures', lang);
        for (const name of readdirSync(fixtureDir)) {
          files.set(`${lang}-${name}`, readFileSync(join(fixtureDir, name), 'utf-8'));
        }
      }
      files.set('nested.js', NESTED);
      mkdirSync(join(dir, 'src'));
      for (const [name, code] of files) writeFileSync(join(dir, 'src', name), code);

      // Thresholds are lowered so every function is reported; extraction options stay default.
      writeFileSync(
        join(dir, '.oxlintrc.json'),
        JSON.stringify({
          jsPlugins: [distEntry],
          rules: {
            'complexity/complexity': [
              'warn',
              { cognitive: 0, cyclomatic: 1, minLines: 0, extractionMultiplier: 1 },
            ],
          },
        })
      );

      let stdout: string;
      try {
        stdout = execFileSync(oxlintBin, ['-c', '.oxlintrc.json', '-f', 'json', 'src'], {
          cwd: dir,
          encoding: 'utf-8',
          maxBuffer: 64 * 1024 * 1024,
        });
      } catch (error) {
        // oxlint exits non-zero when it reports diagnostics; anything else is a real failure.
        const e = error as { status?: number; stdout?: string };
        if (typeof e.stdout !== 'string' || e.status !== 1) throw error;
        stdout = e.stdout;
      }
      const diagnostics = (JSON.parse(stdout) as { diagnostics: Diagnostic[] }).diagnostics;

      const cli = new Map<string, string>();
      for (const d of diagnostics) {
        if (!/has Cognitive Complexity of/.test(d.message)) continue;
        const code = Buffer.from(files.get(d.filename.replace(/^src\//, ''))!);
        const { offset, length } = d.labels[0].span;
        const name = /^Function '(.*)' has Cognitive/.exec(d.message)![1];
        const idx = d.message.indexOf('\n\nSmart extraction suggestions:');
        const key = `${d.filename} ${name}@${lineAt(code, offset)}-${lineAt(code, offset + length - 1)}`;
        cli.set(key, idx === -1 ? '' : d.message.slice(idx));
      }

      const harness = new Map<string, string>();
      for (const [name, code] of files) {
        for (const r of analyze(code, name)) {
          const text = formatExtractionSuggestions(r.suggestions);
          if (text !== '')
            harness.set(`src/${name} ${r.functionName}@${r.startLine}-${r.endLine}`, text);
        }
      }

      const cliWithSuggestions = new Map([...cli].filter(([, text]) => text !== ''));
      expect(harness.size).toBeGreaterThan(5);
      expect([...harness.keys()].some((k) => k.startsWith('src/nested.js inner'))).toBe(true);
      expect([...cliWithSuggestions.keys()].sort()).toEqual([...harness.keys()].sort());
      for (const [key, text] of harness) {
        expect(cliWithSuggestions.get(key), key).toBe(text);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(buildDir, { recursive: true, force: true });
    }
  });
});
