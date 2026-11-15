import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export interface PlaceholderProps {
  readonly title: string;
  readonly description?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function Placeholder({ title, description, className, children }: PlaceholderProps) {
  return (
    <section className={clsx('relay-placeholder', className)} aria-label={title}>
      <h1 className="relay-placeholder__title">{title}</h1>
      {description === undefined ? null : (
        <p className="relay-placeholder__description">{description}</p>
      )}
      {children}
    </section>
  );
}
