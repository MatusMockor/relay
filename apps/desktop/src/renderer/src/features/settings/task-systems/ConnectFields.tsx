import type { TaskSystemProvider } from '@relay/shared';
import type { ChangeEvent, ComponentType, ReactNode } from 'react';
import { ConnectInput } from './ConnectInput';
import type { ConnectField } from './provider-forms';

export const ATLASSIAN_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';
export const LINEAR_KEYS_URL = 'https://linear.app/settings/account/security';
export const GITHUB_TOKENS_URL = 'https://github.com/settings/personal-access-tokens';

export interface BoundField {
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export interface ConnectFieldsProps {
  readonly bind: (field: ConnectField) => BoundField;
  readonly openExternal: (url: string) => void;
}

interface HintLinkProps {
  readonly url: string;
  readonly openExternal: (url: string) => void;
  readonly children: ReactNode;
}

const STORAGE_NOTE = 'Relay ho uloží zašifrovaný a použije len na čítanie tvojich úloh.';

function HintLink({ url, openExternal, children }: HintLinkProps) {
  return (
    <button
      type="button"
      className="ts-link"
      onClick={() => {
        openExternal(url);
      }}
    >
      {children}
    </button>
  );
}

function JiraFields({ bind, openExternal }: ConnectFieldsProps) {
  return (
    <>
      <ConnectInput
        label="URL webu"
        type="url"
        placeholder="napr. https://firma.atlassian.net"
        {...bind('siteUrl')}
      />
      <ConnectInput label="E-mail" type="email" placeholder="ty@firma.sk" {...bind('email')} />
      <ConnectInput label="API token" type="password" {...bind('apiToken')} />
      <p className="ts-hint">
        API token vytvoríš v{' '}
        <HintLink url={ATLASSIAN_TOKENS_URL} openExternal={openExternal}>
          nastaveniach účtu Atlassian
        </HintLink>
        . {STORAGE_NOTE}
      </p>
    </>
  );
}

function LinearFields({ bind, openExternal }: ConnectFieldsProps) {
  return (
    <>
      <ConnectInput
        label="API kľúč"
        type="password"
        placeholder="lin_api_…"
        {...bind('apiToken')}
      />
      <p className="ts-hint">
        Osobný API kľúč vytvoríš v{' '}
        <HintLink url={LINEAR_KEYS_URL} openExternal={openExternal}>
          nastaveniach Linear
        </HintLink>{' '}
        v časti {'Settings > Security & access > Personal API keys'}. {STORAGE_NOTE}
      </p>
    </>
  );
}

function GitHubFields({ bind, openExternal }: ConnectFieldsProps) {
  return (
    <>
      <ConnectInput
        label="Personal access token"
        type="password"
        placeholder="github_pat_…"
        {...bind('apiToken')}
      />
      <p className="ts-hint">
        Token vytvoríš v{' '}
        <HintLink url={GITHUB_TOKENS_URL} openExternal={openExternal}>
          nastaveniach GitHubu
        </HintLink>
        . Stačí fine-grained token s oprávnením Issues: Read-only pre repozitáre, ktoré chceš
        vidieť. Klasický token potrebuje rozsah repo. {STORAGE_NOTE}
      </p>
    </>
  );
}

export const PROVIDER_FIELDS: Readonly<
  Record<TaskSystemProvider, ComponentType<ConnectFieldsProps>>
> = {
  jira: JiraFields,
  linear: LinearFields,
  github: GitHubFields,
};
