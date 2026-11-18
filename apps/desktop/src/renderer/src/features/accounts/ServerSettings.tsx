import { Field, Icon } from '@relay/ui';
import type { AccountFormValues } from './account-form';
import { serverSummaryOf } from './server-summary';

type ServerField = 'imapHost' | 'imapPort' | 'smtpHost' | 'smtpPort';

export interface ServerSettingsProps {
  readonly values: AccountFormValues;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onChange: (field: ServerField) => (event: { target: { value: string } }) => void;
}

function Summary({ values }: { readonly values: AccountFormValues }) {
  const summary = serverSummaryOf(values);
  if (summary === null) {
    return <span className="srv-s">Doplníme podľa e-mailovej adresy</span>;
  }
  return (
    <span className="srv-s">
      <b>{summary.source}</b>
      <span>{summary.endpoints}</span>
    </span>
  );
}

export function ServerSettings({ values, open, onToggle, onChange }: ServerSettingsProps) {
  return (
    <section className={open ? 'srv open' : 'srv'} aria-label="Server">
      <button
        type="button"
        className="srv-t"
        aria-expanded={open}
        aria-controls="acc-srv"
        onClick={onToggle}
      >
        <Icon name="forward" size={13} />
        <span className="srv-tx">
          <span className="srv-l">Rozšírené nastavenia servera</span>
          <Summary values={values} />
        </span>
      </button>
      <div id="acc-srv" className="srv-b" hidden={!open}>
        <div className="fld-2">
          <Field
            id="acc-f-imapHost"
            label="IMAP server"
            placeholder="imap.firma.sk"
            value={values.imapHost}
            onChange={onChange('imapHost')}
          />
          <Field
            id="acc-f-imapPort"
            label="Port IMAP"
            inputMode="numeric"
            value={values.imapPort}
            onChange={onChange('imapPort')}
          />
        </div>
        <div className="fld-2">
          <Field
            id="acc-f-smtpHost"
            label="SMTP server"
            placeholder="smtp.firma.sk"
            value={values.smtpHost}
            onChange={onChange('smtpHost')}
          />
          <Field
            id="acc-f-smtpPort"
            label="Port SMTP"
            inputMode="numeric"
            value={values.smtpPort}
            onChange={onChange('smtpPort')}
          />
        </div>
      </div>
    </section>
  );
}
