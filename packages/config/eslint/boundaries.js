const appsRestriction = {
  regex: '^@relay/(desktop|server)(/|$)|(^|/)apps/',
  message: 'Packages must never import from apps.',
};

const boundaryRules = {
  shared: [
    {
      regex: '^(?!zod(/|$)|\\.)',
      message: '@relay/shared may import only zod.',
    },
  ],
  engine: [
    {
      regex: '^(?!@relay/shared(/|$)|\\.)',
      message: '@relay/engine may import only @relay/shared.',
    },
  ],
  package: [appsRestriction],
  app: [],
};

export const boundaryKinds = Object.keys(boundaryRules);

export function boundaryConfig(kind) {
  const patterns = boundaryRules[kind];
  if (patterns === undefined) {
    throw new Error(`Unknown boundary kind "${kind}". Use one of: ${boundaryKinds.join(', ')}.`);
  }
  if (patterns.length === 0) {
    return [];
  }
  return [
    {
      files: ['src/**/*.{ts,tsx}'],
      ignores: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**'],
      rules: {
        'no-restricted-imports': ['error', { patterns }],
      },
    },
  ];
}
