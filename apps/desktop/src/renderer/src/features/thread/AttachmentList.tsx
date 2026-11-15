import type { AttachmentMeta } from '@relay/shared';
import { Icon } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { useAppContext, useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';

const UNITS = ['B', 'kB', 'MB', 'GB'];

export const formatSize = (bytes: number): string => {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${UNITS[unit] ?? 'B'}`;
};

const nameOf = (attachment: AttachmentMeta): string => attachment.filename ?? 'príloha';

function AttachmentLink({ attachment }: { readonly attachment: AttachmentMeta }) {
  const client = useClient();
  const { platform } = useAppContext();
  const [busy, setBusy] = useState(false);
  const name = nameOf(attachment);
  const download = () => {
    setBusy(true);
    client
      .downloadAttachment(attachment.id)
      .then((file) => {
        platform.saveFile(file.blob, name);
      })
      .catch((error: unknown) => {
        showToast(`Prílohu ${name} sa nepodarilo stiahnuť: ${describeError(error)}`);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <button
      type="button"
      className="att"
      disabled={busy}
      aria-label={`Stiahnuť ${name}`}
      onClick={download}
    >
      <Icon name="down" size={13} />
      <span className="n">{name}</span>
      <span className="z">{busy ? 'Sťahujem…' : formatSize(attachment.size)}</span>
    </button>
  );
}

export function AttachmentList({
  attachments,
}: {
  readonly attachments: readonly AttachmentMeta[];
}) {
  const files = attachments.filter((attachment) => !attachment.inline);
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="atts" aria-label="Prílohy">
      {files.map((attachment) => (
        <li key={attachment.id}>
          <AttachmentLink attachment={attachment} />
        </li>
      ))}
    </ul>
  );
}
