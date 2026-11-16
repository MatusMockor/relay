import type { Address } from '@relay/shared';
import { Avatar, Icon } from '@relay/ui';

export interface ContactSuggestionsProps {
  readonly options: readonly Address[];
  readonly cursor: number;
  readonly frequent: boolean;
  readonly onPick: (address: Address) => void;
}

export function ContactSuggestions({ options, cursor, frequent, onPick }: ContactSuggestionsProps) {
  if (options.length === 0) {
    return null;
  }
  return (
    <div className="ac" role="listbox" aria-label="Návrhy kontaktov">
      {frequent ? <div className="grp">Časté kontakty</div> : null}
      {options.map((address, index) => (
        <button
          key={address.email}
          type="button"
          role="option"
          aria-selected={index === cursor}
          className={`pi${index === cursor ? ' on' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(address);
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
  );
}
