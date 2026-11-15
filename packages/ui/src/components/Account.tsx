import { clsx } from 'clsx';
import type { CSSProperties } from 'react';

export interface AccountLike {
  readonly name: string;
  readonly color: string;
}

const colorVar = (color: string): CSSProperties => ({ ['--a' as string]: color });

export function AccountDot({
  account,
  title,
}: {
  readonly account: AccountLike;
  readonly title?: string;
}) {
  return <span className="acc-dot" style={colorVar(account.color)} title={title} />;
}

export interface AccountSquareProps {
  readonly account: AccountLike | null;
  readonly all?: readonly AccountLike[];
  readonly small?: boolean;
}

export function AccountSquare({ account, all = [], small = false }: AccountSquareProps) {
  if (account === null) {
    return (
      <span className={clsx('acc-sq all', small && 'sm')} aria-hidden="true">
        {all.slice(0, 3).map((item) => (
          <i key={item.name} style={colorVar(item.color)} />
        ))}
      </span>
    );
  }
  return (
    <span
      className={clsx('acc-sq', small && 'sm')}
      style={colorVar(account.color)}
      aria-hidden="true"
    >
      {account.name.charAt(0).toLocaleUpperCase('sk')}
    </span>
  );
}
