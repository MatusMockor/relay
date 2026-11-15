import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { boundaryConfig } from '../eslint/boundaries.js';
import { codeStyleRules } from '../eslint/index.js';

const lint = async (config: Linter.Config[], code: string, filePath: string) => {
  const eslint = new ESLint({
    cwd: import.meta.dirname,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
      ...config,
    ],
  });
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.message) ?? [];
};

describe('import boundaries', () => {
  it('lets @relay/shared import only zod and relative files', async () => {
    const config = boundaryConfig('shared');
    const allowed = "import { z } from 'zod';\nimport { a } from './a';\n";
    expect(await lint(config, allowed, 'src/x.ts')).toEqual([]);
    const messages = await lint(config, "import { readFile } from 'node:fs';\n", 'src/x.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('@relay/shared may import only zod.');
  });

  it('lets @relay/engine import only @relay/shared', async () => {
    const config = boundaryConfig('engine');
    const allowed = "import type { User } from '@relay/shared/domain';\n";
    expect(await lint(config, allowed, 'src/x.ts')).toEqual([]);
    expect(await lint(config, "import Database from 'better-sqlite3';\n", 'src/x.ts')).toHaveLength(
      1,
    );
    expect(await lint(config, "import { x } from '@relay/mail-core';\n", 'src/x.ts')).toHaveLength(
      1,
    );
  });

  it('forbids packages from importing apps', async () => {
    const config = boundaryConfig('package');
    expect(await lint(config, "import { x } from '@relay/server';\n", 'src/x.ts')).toHaveLength(1);
    const relative = "import { x } from '../../../apps/desktop/src/main';\n";
    expect(await lint(config, relative, 'src/x.ts')).toHaveLength(1);
    expect(await lint(config, "import { x } from '@relay/engine';\n", 'src/x.ts')).toEqual([]);
  });

  it('does not restrict test files', async () => {
    const config = boundaryConfig('shared');
    expect(await lint(config, "import { it } from 'vitest';\n", 'src/x.test.ts')).toEqual([]);
  });
});

describe('code style rules', () => {
  const config: Linter.Config[] = [
    {
      rules: {
        'no-else-return': codeStyleRules['no-else-return'],
        'no-restricted-syntax': codeStyleRules['no-restricted-syntax'],
      },
    },
  ];

  it('rejects else branches', async () => {
    const code = [
      'export function f(a: boolean) {',
      '  if (a) {',
      '    console.log(1);',
      '  } else {',
      '    console.log(2);',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(await lint(config, code, 'src/x.ts')).toEqual([
      'Do not use else / else if. Use guard clauses and early returns.',
    ]);
  });

  it('accepts guard clauses', async () => {
    const code =
      'export function f(a: boolean) {\n  if (a) {\n    return 1;\n  }\n  return 2;\n}\n';
    expect(await lint(config, code, 'src/x.ts')).toEqual([]);
  });
});
