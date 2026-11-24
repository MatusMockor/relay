import type { TaskSystemProvider } from '@relay/shared';
import { Button } from '@relay/ui';
import { type ChangeEvent, useState } from 'react';
import { describeError } from '../../../data/errors';
import { useAppContext } from '../../../data/hooks/services-context';
import { useConnectTaskSystem } from '../../../data/hooks/use-task-system-mutations';
import { showToast } from '../../../state/toast-store';
import type { TaskSystemConnectDraft } from '../../../state/ui-store';
import {
  type ConnectField,
  type ConnectFormErrors,
  type ConnectFormValues,
  parseConnectForm,
  serverFieldErrors,
} from './connect-form';
import { ConnectInput } from './ConnectInput';
import { ProviderPicker } from './ProviderPicker';

export const ATLASSIAN_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

export interface ConnectTaskSystemFormProps {
  readonly draft: TaskSystemConnectDraft;
  readonly onDone: () => void;
  readonly onCancel?: () => void;
}

export function ConnectTaskSystemForm({ draft, onDone, onCancel }: ConnectTaskSystemFormProps) {
  const { platform } = useAppContext();
  const connect = useConnectTaskSystem();
  const [provider, setProvider] = useState<TaskSystemProvider>('jira');
  const [values, setValues] = useState<ConnectFormValues>({
    siteUrl: draft.siteUrl,
    email: '',
    apiToken: '',
    label: draft.label,
  });
  const [errors, setErrors] = useState<ConnectFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const bind = (field: ConnectField) => ({
    value: values[field],
    error: errors[field],
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
    },
  });
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
        setErrors(serverFieldErrors(error));
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
      <ProviderPicker value={provider} onChange={setProvider} />
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
        <button
          type="button"
          className="ts-link"
          onClick={() => {
            platform.openExternal(ATLASSIAN_TOKENS_URL);
          }}
        >
          nastaveniach účtu Atlassian
        </button>
        . Relay ho uloží zašifrovaný a použije len na čítanie tvojich úloh.
      </p>
      <ConnectInput
        label="Názov"
        placeholder="Nepovinné, napr. Firemná Jira"
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
