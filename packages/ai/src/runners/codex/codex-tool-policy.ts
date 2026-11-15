const DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'view_image',
  'image_generation',
  'apps',
  'plugins',
  'browser_use',
  'browser_use_external',
  'multi_agent',
] as const;

export function codexBuiltinToolOverrides(): string[] {
  return [
    ...DISABLED_FEATURES.flatMap((feature) => ['-c', `features.${feature}=false`]),
    '-c',
    'web_search="disabled"',
  ];
}
