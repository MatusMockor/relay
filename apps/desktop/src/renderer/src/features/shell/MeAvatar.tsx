import { cx, initialsOf } from '@relay/ui';

export const ME_INITIALS = 'JA';

export interface MeAvatarProps {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly name?: string;
}

export function MeAvatar({ size = 'md', name }: MeAvatarProps) {
  return (
    <span className={cx('av', 'c1', size !== 'md' && size)} aria-hidden="true">
      {name === undefined || name.trim() === '' ? ME_INITIALS : initialsOf(name)}
    </span>
  );
}
