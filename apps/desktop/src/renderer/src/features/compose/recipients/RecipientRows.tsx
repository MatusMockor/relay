import { MOD } from '../../../lib/platform-keys';
import type { RecipientEntry } from './address-parsing';
import {
  type ComposeRecipients,
  RECIPIENT_INPUT_IDS,
  type RecipientKind,
} from './compose-recipients';
import { RecipientInput } from './RecipientInput';

export interface RecipientRowsProps {
  readonly recipients: ComposeRecipients;
  readonly visible: ReadonlySet<RecipientKind>;
  readonly readOnly: boolean;
  readonly autoFocus: boolean;
  readonly onChange: (kind: RecipientKind, entries: RecipientEntry[]) => void;
  readonly onReveal: (kind: RecipientKind) => void;
  readonly onDone: () => void;
}

const LABELS: Readonly<Record<RecipientKind, string>> = {
  to: 'Komu',
  cc: 'Kópia',
  bcc: 'Skrytá kópia',
};

const SHORTCUTS: Readonly<Record<'cc' | 'bcc', string>> = { cc: 'C', bcc: 'B' };

function RevealButtons({ visible, onReveal }: Pick<RecipientRowsProps, 'visible' | 'onReveal'>) {
  const hidden = (['cc', 'bcc'] as const).filter((kind) => !visible.has(kind));
  if (hidden.length === 0) {
    return null;
  }
  return (
    <span className="rcp-more">
      {hidden.map((kind) => (
        <button
          key={kind}
          type="button"
          title={`${LABELS[kind]} (${MOD}⇧${SHORTCUTS[kind]})`}
          onClick={() => {
            onReveal(kind);
          }}
        >
          {kind === 'cc' ? 'Kópia' : 'Skrytá'}
        </button>
      ))}
    </span>
  );
}

export function RecipientRows(props: RecipientRowsProps) {
  const { recipients, visible, readOnly, autoFocus, onChange, onReveal, onDone } = props;
  const kinds = (['to', 'cc', 'bcc'] as const).filter((kind) => kind === 'to' || visible.has(kind));
  const taken = [...recipients.to, ...recipients.cc, ...recipients.bcc].map((entry) =>
    entry.address.email.toLowerCase(),
  );
  return (
    <>
      {kinds.map((kind) => (
        <RecipientInput
          key={kind}
          id={RECIPIENT_INPUT_IDS[kind]}
          label={LABELS[kind]}
          entries={recipients[kind]}
          taken={taken}
          readOnly={readOnly}
          autoFocus={kind === 'to' && autoFocus}
          onChange={(entries) => {
            onChange(kind, entries);
          }}
          onDone={onDone}
          trailing={kind === 'to' ? <RevealButtons visible={visible} onReveal={onReveal} /> : null}
        />
      ))}
    </>
  );
}
