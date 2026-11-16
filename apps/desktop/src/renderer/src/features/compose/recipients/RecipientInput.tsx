import type { Address } from '@relay/shared';
import { type ReactNode, useState } from 'react';
import { useKnownContacts } from '../use-known-contacts';
import { mergeEntries, parseRecipients, type RecipientEntry } from './address-parsing';
import { ContactSuggestions } from './ContactSuggestions';
import { RecipientChip } from './RecipientChip';

export interface RecipientInputProps {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly RecipientEntry[];
  readonly taken: readonly string[];
  readonly onChange: (entries: RecipientEntry[]) => void;
  readonly onDone: () => void;
  readonly autoFocus?: boolean;
  readonly readOnly?: boolean;
  readonly trailing?: ReactNode;
}

const SEPARATOR = /[,;\n]/;

export function RecipientInput(props: RecipientInputProps) {
  const { id, label, entries, taken, onChange, onDone, autoFocus, readOnly, trailing } = props;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const contacts = useKnownContacts();
  const chosen = new Set([...taken, ...entries.map((entry) => entry.address.email.toLowerCase())]);
  const options =
    open && !readOnly
      ? contacts(query).filter((item) => !chosen.has(item.email.toLowerCase()))
      : [];
  const commit = (text: string) => {
    const parsed = parseRecipients(text);
    if (parsed.length > 0) {
      onChange(mergeEntries(entries, parsed));
    }
  };
  const pick = (address: Address) => {
    onChange(mergeEntries(entries, [{ address, valid: true }]));
    setQuery('');
    setCursor(0);
  };
  const type = (value: string) => {
    if (!SEPARATOR.test(value)) {
      setQuery(value);
      setOpen(true);
      setCursor(0);
      return;
    }
    const last = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'), value.lastIndexOf('\n'));
    commit(value.slice(0, last));
    setQuery(value.slice(last + 1).trimStart());
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (options.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setCursor((index) => (index + step + options.length) % options.length);
      return;
    }
    if (event.key === 'Enter' && !(event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      const option = options[cursor];
      if (option !== undefined) {
        pick(option);
        return;
      }
      if (query.trim() === '') {
        onDone();
        return;
      }
      commit(query);
      setQuery('');
      return;
    }
    if (event.key === 'Tab' && query.trim() !== '') {
      commit(query);
      setQuery('');
      return;
    }
    if (event.key === 'Backspace' && query === '' && entries.length > 0) {
      onChange(entries.slice(0, -1));
    }
  };
  return (
    <div className="nm-f rcp">
      <label className="lb" htmlFor={id}>
        {label}
      </label>
      {entries.map((entry, index) => (
        <RecipientChip
          key={`${entry.address.email}-${String(index)}`}
          entry={entry}
          onRemove={() => {
            onChange(entries.filter((_, position) => position !== index));
          }}
        />
      ))}
      <input
        id={id}
        autoFocus={autoFocus}
        placeholder={entries.length === 0 ? 'Meno alebo e-mail' : ''}
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        readOnly={readOnly}
        value={query}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          if (query.trim() !== '') {
            commit(query);
            setQuery('');
          }
        }}
        onChange={(event) => {
          type(event.target.value);
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text');
          if (!SEPARATOR.test(text)) {
            return;
          }
          event.preventDefault();
          commit(`${query}${text}`);
          setQuery('');
        }}
        onKeyDown={onKeyDown}
      />
      {trailing}
      <ContactSuggestions
        options={options}
        cursor={cursor}
        frequent={query.trim() === ''}
        onPick={pick}
      />
    </div>
  );
}
