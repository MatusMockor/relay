import type { Address } from '@relay/shared';
import type { DraftExtras } from './draft-extras';

const listOf = (addresses: readonly Address[]): string =>
  addresses.map((address) => address.name ?? address.email).join(', ');

function ExtraRow({ label, value }: { readonly label: string; readonly value: string }) {
  if (value === '') {
    return null;
  }
  return (
    <div className="nm-f">
      <span className="lb">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function DraftExtrasRows({ extras }: { readonly extras: DraftExtras }) {
  return (
    <>
      <ExtraRow label="Ďalší" value={listOf(extras.to)} />
      <ExtraRow label="Kópia" value={listOf(extras.cc)} />
      <ExtraRow label="Skrytá kópia" value={listOf(extras.bcc)} />
      <ExtraRow
        label="Prílohy"
        value={extras.attachments.map((attachment) => attachment.filename).join(', ')}
      />
    </>
  );
}
