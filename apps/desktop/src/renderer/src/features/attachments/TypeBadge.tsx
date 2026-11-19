import type { AttachmentMeta } from '@relay/shared';
import { badgeOf, badgeToneOf } from './attachment-kind';

export function TypeBadge({ attachment }: { readonly attachment: AttachmentMeta }) {
  return (
    <span className={`att-ty ${badgeToneOf(attachment)}`} aria-hidden="true">
      {badgeOf(attachment)}
    </span>
  );
}
