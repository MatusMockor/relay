import { relayConfig } from '@relay/config/eslint';

export default [
  ...relayConfig({ tsconfigRootDir: import.meta.dirname, boundary: 'app' }),
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
];
