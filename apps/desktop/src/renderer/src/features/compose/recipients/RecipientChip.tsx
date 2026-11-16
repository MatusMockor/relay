import { Avatar, Icon } from '@relay/ui';
import type { RecipientEntry } from './address-parsing';

export function RecipientChip({
  entry,
  onRemove,
}: {
  readonly entry: RecipientEntry;
  readonly onRemove: () => void;
}) {
  const label = entry.address.name ?? entry.address.email;
  return (
    <span
      className={`to-chip${entry.valid ? '' : ' bad'}`}
      title={entry.valid ? entry.address.email : `Neplatná adresa: ${entry.address.email}`}
    >
      {entry.valid ? (
        <Avatar name={label} seed={entry.address.email} size="sm" />
      ) : (
        <span className="bad-ic" aria-hidden="true">
          !
        </span>
      )}
      {label}
      {entry.valid ? null : <span className="sr-only">, neplatná adresa</span>}
      <button type="button" aria-label={`Odstrániť príjemcu ${label}`} onClick={onRemove}>
        <Icon name="x" />
      </button>
    </span>
  );
}
