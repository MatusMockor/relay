import { cx } from '@relay/ui';

export const ME_INITIALS = 'JA';

export function MeAvatar({ size = 'md' }: { readonly size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cx('av', 'c1', size !== 'md' && size)} aria-hidden="true">
      {ME_INITIALS}
    </span>
  );
}
