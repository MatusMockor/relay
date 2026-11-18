import type { AiRunnerKind } from '@relay/shared';
import type { SVGProps } from 'react';
import { CLAUDE_LOGO_PATH, OPENAI_LOGO_PATH } from './provider-paths';

interface LogoShape {
  readonly viewBox: string;
  readonly path: SVGProps<SVGPathElement>;
}

const LOGOS: Readonly<Record<AiRunnerKind, LogoShape>> = {
  claude: { viewBox: '0 0 256 257', path: { fill: '#d97757', d: CLAUDE_LOGO_PATH } },
  codex: {
    viewBox: '100 100 411 411',
    path: { fill: 'currentColor', fillRule: 'evenodd', clipRule: 'evenodd', d: OPENAI_LOGO_PATH },
  },
};

export interface ProviderLogoProps {
  readonly runner: AiRunnerKind;
  readonly size?: number;
}

export function ProviderLogo({ runner, size = 16 }: ProviderLogoProps) {
  const logo = LOGOS[runner];
  return (
    <svg
      className="plogo"
      width={size}
      height={size}
      viewBox={logo.viewBox}
      preserveAspectRatio="xMidYMid"
      aria-hidden="true"
    >
      <path {...logo.path} />
    </svg>
  );
}
