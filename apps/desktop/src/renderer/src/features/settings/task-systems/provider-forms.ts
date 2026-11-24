import type { TaskSystemProvider } from '@relay/shared';

export interface ConnectFormValues {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
  readonly label: string;
}

export type ConnectField = keyof ConnectFormValues;
export type ConnectFormErrors = Partial<Record<ConnectField, string>>;

export interface ProviderFormSpec {
  readonly secretMessage: string;
  readonly labelPlaceholder: string;
  readonly inputOf: (values: ConnectFormValues) => Readonly<Record<string, string>>;
  readonly fieldOf: Readonly<Record<string, ConnectField>>;
  readonly validate: (values: ConnectFormValues) => ConnectFormErrors;
}

const parsedUrl = (raw: string): URL | null => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

export const normalizeSiteUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

export const SITE_URL_MESSAGE = 'Zadaj adresu webu, napríklad https://firma.atlassian.net';

const siteUrlErrors = (values: ConnectFormValues): ConnectFormErrors => {
  const url = parsedUrl(normalizeSiteUrl(values.siteUrl));
  if (url === null || !url.hostname.includes('.')) {
    return { siteUrl: SITE_URL_MESSAGE };
  }
  return url.protocol === 'https:' ? {} : { siteUrl: 'Adresa musí začínať https://' };
};

const noErrors = (): ConnectFormErrors => ({});

export const PROVIDER_FORMS: Readonly<Record<TaskSystemProvider, ProviderFormSpec>> = {
  jira: {
    secretMessage: 'Zadaj API token',
    labelPlaceholder: 'Nepovinné, napr. Firemná Jira',
    inputOf: (values) => ({
      siteUrl: normalizeSiteUrl(values.siteUrl),
      email: values.email,
      apiToken: values.apiToken,
    }),
    fieldOf: { siteUrl: 'siteUrl', email: 'email', apiToken: 'apiToken', label: 'label' },
    validate: siteUrlErrors,
  },
  linear: {
    secretMessage: 'Zadaj API kľúč',
    labelPlaceholder: 'Nepovinné, napr. Firemný Linear',
    inputOf: (values) => ({ apiKey: values.apiToken }),
    fieldOf: { apiKey: 'apiToken', label: 'label' },
    validate: noErrors,
  },
  github: {
    secretMessage: 'Zadaj personal access token',
    labelPlaceholder: 'Nepovinné, napr. Pracovný GitHub',
    inputOf: (values) => ({ token: values.apiToken }),
    fieldOf: { token: 'apiToken', label: 'label' },
    validate: noErrors,
  },
};
