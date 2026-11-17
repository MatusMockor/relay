import type { AiRunnerKind } from '@relay/shared';

const GLYPHS: Readonly<
  Record<AiRunnerKind, { readonly className: string; readonly glyph: string }>
> = {
  claude: { className: 'cl', glyph: '✳' },
  codex: { className: 'cx', glyph: '⌘' },
};

export function ProviderIcon({
  runner,
  small = false,
}: {
  readonly runner: AiRunnerKind;
  readonly small?: boolean;
}) {
  const { className, glyph } = GLYPHS[runner];
  return (
    <span className={`pv ${className}${small ? ' sm' : ''}`} aria-hidden="true">
      {glyph}
    </span>
  );
}
