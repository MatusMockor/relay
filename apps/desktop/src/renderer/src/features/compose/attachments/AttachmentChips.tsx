import { Icon } from '@relay/ui';
import { formatSize } from '../../thread/AttachmentList';
import { type ComposeAttachment, nameOf, sizeOf } from './compose-attachment';

const stateOf = (item: ComposeAttachment): string => {
  if (item.kind === 'uploading') {
    return 'Nahrávam…';
  }
  if (item.kind === 'failed') {
    return 'Nepodarilo sa nahrať';
  }
  return formatSize(sizeOf(item));
};

function AttachmentChip({
  item,
  onRemove,
}: {
  readonly item: ComposeAttachment;
  readonly onRemove: () => void;
}) {
  const name = nameOf(item);
  return (
    <li
      className={`att-chip ${item.kind}`}
      title={item.kind === 'failed' ? (item.error ?? undefined) : name}
      aria-busy={item.kind === 'uploading'}
    >
      <Icon name={item.kind === 'failed' ? 'x' : 'clip'} size={13} />
      <span className="n">{name}</span>
      <span className="z">{stateOf(item)}</span>
      {item.kind === 'uploading' ? <span className="bar" aria-hidden="true" /> : null}
      <button type="button" aria-label={`Odstrániť prílohu ${name}`} onClick={onRemove}>
        <Icon name="x" />
      </button>
    </li>
  );
}

export function AttachmentChips({
  items,
  onRemove,
}: {
  readonly items: readonly ComposeAttachment[];
  readonly onRemove: (key: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="att-chips" aria-label="Prílohy">
      {items.map((item) => (
        <AttachmentChip
          key={item.key}
          item={item}
          onRemove={() => {
            onRemove(item.key);
          }}
        />
      ))}
    </ul>
  );
}
