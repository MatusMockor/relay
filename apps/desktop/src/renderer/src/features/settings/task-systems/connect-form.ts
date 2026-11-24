import {
  type ApiErrorIssue,
  type ConnectTaskSystemInput,
  ConnectTaskSystemInputSchema,
  type TaskSystemProvider,
} from '@relay/shared';
import { MailClientError } from '../../../data/errors';

export interface ConnectFormValues {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
  readonly label: string;
}

export type ConnectField = keyof ConnectFormValues;
export type ConnectFormErrors = Partial<Record<ConnectField, string>>;
export type ConnectFormResult =
  | { readonly ok: true; readonly input: ConnectTaskSystemInput }
  | { readonly ok: false; readonly errors: ConnectFormErrors };

const MESSAGES: Readonly<Record<ConnectField, string>> = {
  siteUrl: 'Zadaj adresu webu, napríklad https://firma.atlassian.net',
  email: 'Zadaj platný e-mail',
  apiToken: 'Zadaj API token',
  label: 'Názov môže mať najviac 100 znakov',
};

const FIELDS: readonly ConnectField[] = ['siteUrl', 'email', 'apiToken', 'label'];

const isField = (value: unknown): value is ConnectField => FIELDS.some((field) => field === value);

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

const siteUrlError = (siteUrl: string): string | null => {
  const url = parsedUrl(siteUrl);
  if (url === null || !url.hostname.includes('.')) {
    return MESSAGES.siteUrl;
  }
  return url.protocol === 'https:' ? null : 'Adresa musí začínať https://';
};

const issueErrors = (paths: readonly (readonly PropertyKey[])[]): ConnectFormErrors =>
  paths.reduce<ConnectFormErrors>((errors, path) => {
    const field = path[0];
    if (!isField(field) || errors[field] !== undefined) {
      return errors;
    }
    return { ...errors, [field]: MESSAGES[field] };
  }, {});

export const parseConnectForm = (
  provider: TaskSystemProvider,
  values: ConnectFormValues,
): ConnectFormResult => {
  const siteUrl = normalizeSiteUrl(values.siteUrl);
  const parsed = ConnectTaskSystemInputSchema.safeParse({
    provider,
    siteUrl,
    email: values.email,
    apiToken: values.apiToken,
    label: values.label.trim() === '' ? undefined : values.label,
  });
  const siteError = siteUrlError(siteUrl);
  const errors: ConnectFormErrors = {
    ...(parsed.success ? {} : issueErrors(parsed.error.issues.map((issue) => issue.path))),
    ...(siteError === null ? {} : { siteUrl: siteError }),
  };
  if (!parsed.success || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, input: parsed.data };
};

const fieldOfIssue = (issue: ApiErrorIssue): ConnectField | null => {
  const last = issue.path.split('.').at(-1);
  return isField(last) ? last : null;
};

export const serverFieldErrors = (error: unknown): ConnectFormErrors => {
  if (!(error instanceof MailClientError)) {
    return {};
  }
  return error.issues.reduce<ConnectFormErrors>((errors, issue) => {
    const field = fieldOfIssue(issue);
    if (field === null || errors[field] !== undefined) {
      return errors;
    }
    return { ...errors, [field]: issue.message };
  }, {});
};
