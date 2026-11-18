import { Icon, type StrokeIconName } from '@relay/ui';
import type { UpdateButtonKind } from './update-button-view';

const ICONS: Readonly<Record<UpdateButtonKind, StrokeIconName>> = {
  check: 'refresh',
  checking: 'refresh',
  checked: 'check',
  downloading: 'download',
  ready: 'refresh',
  installing: 'refresh',
  error: 'warning',
};

const SIZES: Readonly<Partial<Record<UpdateButtonKind, number>>> = { downloading: 13 };

function ReadyBadge() {
  return (
    <span className="upd-badge">
      <Icon name="check" size={7} strokeWidth={2.6} />
    </span>
  );
}

export function UpdateIcon({ kind }: { readonly kind: UpdateButtonKind }) {
  const ready = kind === 'ready' || kind === 'installing';
  return (
    <>
      <Icon name={ICONS[kind]} size={SIZES[kind] ?? 15} />
      {ready && <ReadyBadge />}
    </>
  );
}
