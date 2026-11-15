import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { boundaryConfig } from './boundaries.js';

export { boundaryKinds } from './boundaries.js';

export const codeStyleRules = {
  'no-else-return': ['error', { allowElseIf: false }],
  'no-restricted-syntax': [
    'error',
    {
      selector: 'IfStatement[alternate]',
      message: 'Do not use else / else if. Use guard clauses and early returns.',
    },
  ],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
};

const reactConfig = [
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
];

export function relayConfig({ tsconfigRootDir, boundary, react = false, ignores = [] }) {
  return tseslint.config(
    { ignores: ['dist/**', 'out/**', 'coverage/**', 'release/**', ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
        globals: globals.node,
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: codeStyleRules,
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    ...(react ? reactConfig : []),
    ...boundaryConfig(boundary),
    prettier,
  );
}
