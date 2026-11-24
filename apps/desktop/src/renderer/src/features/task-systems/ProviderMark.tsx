import type { TaskSystemProvider } from '@relay/shared';
import type { ReactNode } from 'react';

const JIRA_PATH =
  'M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z';

const SHAPES: Readonly<Record<TaskSystemProvider, ReactNode>> = {
  jira: <path fill="currentColor" d={JIRA_PATH} />,
  linear: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M6 15 15 6M9 18l9-9" />
    </g>
  ),
  github: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </g>
  ),
};

export interface ProviderMarkProps {
  readonly provider: TaskSystemProvider;
  readonly size?: number;
}

export function ProviderMark({ provider, size = 14 }: ProviderMarkProps) {
  return (
    <svg
      className={`ts-mark ts-mark-${provider}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {SHAPES[provider]}
    </svg>
  );
}
