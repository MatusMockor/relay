import type { TaskSystemProvider } from '@relay/shared';
import { Button } from '@relay/ui';
import { type ChangeEvent, useState } from 'react';
import { describeError } from '../../../data/errors';
import { useAppContext } from '../../../data/hooks/services-context';
import { useConnectTaskSystem } from '../../../data/hooks/use-task-system-mutations';
import { showToast } from '../../../state/toast-store';
import type { TaskSystemConnectDraft } from '../../../state/ui-store';
import { parseConnectForm, serverFieldErrors } from './connect-form';
import { PROVIDER_FIELDS } from './ConnectFields';
import { ConnectInput } from './ConnectInput';
import {
  type ConnectField,
  type ConnectFormErrors,
  type ConnectFormValues,
  PROVIDER_FORMS,
} from './provider-forms';
import { ProviderPicker } from './ProviderPicker';

export interface ConnectTaskSystemFormProps {
  readonly draft: TaskSystemConnectDraft;
  readonly onDone: () => void;
  readonly onCancel?: () => void;
}

export function ConnectTaskSystemForm({ draft, onDone, onCancel }: ConnectTaskSystemFormProps) {
  const { platform } = useAppContext();
  const connect = useConnectTaskSystem();
  const [provider, setProvider] = useState<TaskSystemProvider>(draft.provider);
  const [values, setValues] = useState<ConnectFormValues>({
    siteUrl: draft.siteUrl,
    email: '',
    apiToken: '',
    label: draft.label,
  });
  const [errors, setErrors] = useState<ConnectFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const Fields = PROVIDER_FIELDS[provider];
  const bind = (field: ConnectField) => ({
    value: values[field],
    error: errors[field],
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    },
  });
  const pick = (next: TaskSystemProvider) => {
    setProvider(next);
    setErrors({});
    setFailure(null);
  };
  const submit = () => {
    const result = parseConnectForm(provider, values);
    setFailure(null);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const forgetToken = () => {
      setValues((current) => ({ ...current, apiToken: '' }));
    };
    void connect.connect(result.input).then(
      (connection) => {
        forgetToken();
        showToast(`Pripojené: ${connection.label}`);
        onDone();
      },
      (error: unknown) => {
        forgetToken();
        setErrors(serverFieldErrors(provider, error));
        setFailure(describeError(error));
      },
    );
  };
  return (
    <form
      className="ts-form"
      aria-label="Pripojiť task systém"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ProviderPicker value={provider} onChange={pick} />
      <Fields
        bind={bind}
        openExternal={(url) => {
          platform.openExternal(url);
        }}
      />
      <ConnectInput
        label="Názov"
        placeholder={PROVIDER_FORMS[provider].labelPlaceholder}
        maxLength={100}
        {...bind('label')}
      />
      {failure === null ? null : (
        <p className="ts-err" role="alert">
          {failure}
        </p>
      )}
      <div className="ts-form-acts">
        <Button type="submit" variant="primary" disabled={connect.isPending}>
          {connect.isPending ? 'Overuje sa…' : 'Pripojiť'}
        </Button>
        {onCancel === undefined ? null : <Button onClick={onCancel}>Zrušiť</Button>}
      </div>
    </form>
  );
}
