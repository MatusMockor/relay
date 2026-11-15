import type { Address } from '@relay/shared';
import { Avatar, Icon } from '@relay/ui';
import { useState } from 'react';
import { useKnownContacts } from './use-known-contacts';

export interface RecipientFieldProps {
  readonly value: Address | null;
  readonly onChange: (value: Address | null) => void;
  readonly onDone: () => void;
  readonly autoFocus: boolean;
}

export function RecipientField({ value, onChange, onDone, autoFocus }: RecipientFieldProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const contacts = useKnownContacts();
  const options = open ? contacts(query) : [];
  const pick = (address: Address | undefined) => {
    if (address === undefined) {
      return;
    }
    onChange(address);
    setQuery('');
    setOpen(false);
    onDone();
  };
  return (
    <div className="nm-f">
      <span className="lb">Komu</span>
      {value === null ? null : (
        <span className="to-chip">
          <Avatar name={value.name ?? value.email} seed={value.email} size="sm" />
          {value.name ?? value.email}
          <button
            type="button"
            aria-label="Odstrániť príjemcu"
            onClick={() => {
              onChange(null);
            }}
          >
            <Icon name="x" />
          </button>
        </span>
      )}
      <input
        id="nm-to"
        autoFocus={autoFocus}
        placeholder={value === null ? 'Meno alebo e-mail' : 'Zmeniť príjemcu'}
        autoComplete="off"
        spellCheck={false}
        aria-label="Komu"
        value={query}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onKeyDown={(event) => {
          if (options.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setCursor(
              (index) =>
                (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
            );
            return;
          }
          if (event.key === 'Enter' && !(event.metaKey || event.ctrlKey) && options.length > 0) {
            event.preventDefault();
            pick(options[cursor]);
            return;
          }
          if (event.key === 'Backspace' && query === '' && value !== null) {
            onChange(null);
          }
        }}
      />
      {options.length === 0 ? null : (
        <div className="ac" role="listbox" aria-label="Návrhy kontaktov">
          {query.trim() === '' ? <div className="grp">Časté kontakty</div> : null}
          {options.map((address, index) => (
            <button
              key={address.email}
              type="button"
              role="option"
              aria-selected={index === cursor}
              className={`pi${index === cursor ? ' on' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(address);
              }}
            >
              <span className="ic">
                {address.name === null ? (
                  <Icon name="send" />
                ) : (
                  <Avatar name={address.name} seed={address.email} size="sm" />
                )}
              </span>
              <span className="lb">
                {address.name ?? address.email}
                <small>{address.name === null ? 'nový kontakt' : address.email}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
