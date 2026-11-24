import {
  type ApiErrorIssue,
  type ConnectTaskSystemInput,
  ConnectTaskSystemInputSchema,
  type TaskSystemProvider,
} from '@relay/shared';
import { MailClientError } from '../../../data/errors';
import {
  type ConnectField,
  type ConnectFormErrors,
  type ConnectFormValues,
  PROVIDER_FORMS,
  type ProviderFormSpec,
  SITE_URL_MESSAGE,
} from './provider-forms';

export type ConnectFormResult =
  | { readonly ok: true; readonly input: ConnectTaskSystemInput }
  | { readonly ok: false; readonly errors: ConnectFormErrors };

const messageOf = (spec: ProviderFormSpec, field: ConnectField): string => {
  const messages: Readonly<Record<ConnectField, string>> = {
    siteUrl: SITE_URL_MESSAGE,
    email: 'Zadaj platný e-mail',
    apiToken: spec.secretMessage,
    label: 'Názov môže mať najviac 100 znakov',
  };
  return messages[field];
};

const fieldOf = (spec: ProviderFormSpec, key: PropertyKey | undefined): ConnectField | null =>
  typeof key === 'string' ? (spec.fieldOf[key] ?? null) : null;

const issueErrors = (
  spec: ProviderFormSpec,
  paths: readonly (readonly PropertyKey[])[],
): ConnectFormErrors =>
  paths.reduce<ConnectFormErrors>((errors, path) => {
    const field = fieldOf(spec, path[0]);
    if (field === null || errors[field] !== undefined) {
      return errors;
    }
    return { ...errors, [field]: messageOf(spec, field) };
  }, {});

export const parseConnectForm = (
  provider: TaskSystemProvider,
  values: ConnectFormValues,
): ConnectFormResult => {
  const spec = PROVIDER_FORMS[provider];
  const parsed = ConnectTaskSystemInputSchema.safeParse({
    provider,
    ...spec.inputOf(values),
    label: values.label.trim() === '' ? undefined : values.label,
  });
  const errors: ConnectFormErrors = {
    ...(parsed.success
      ? {}
      : issueErrors(
          spec,
          parsed.error.issues.map((issue) => issue.path),
        )),
    ...spec.validate(values),
  };
  if (!parsed.success || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, input: parsed.data };
};

const fieldOfIssue = (spec: ProviderFormSpec, issue: ApiErrorIssue): ConnectField | null =>
  fieldOf(spec, issue.path.split('.').at(-1));

export const serverFieldErrors = (
  provider: TaskSystemProvider,
  error: unknown,
): ConnectFormErrors => {
  if (!(error instanceof MailClientError)) {
    return {};
  }
  const spec = PROVIDER_FORMS[provider];
  return error.issues.reduce<ConnectFormErrors>((errors, issue) => {
    const field = fieldOfIssue(spec, issue);
    if (field === null || errors[field] !== undefined) {
      return errors;
    }
    return { ...errors, [field]: issue.message };
  }, {});
};
