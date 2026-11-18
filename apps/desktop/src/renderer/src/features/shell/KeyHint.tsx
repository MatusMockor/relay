import { Kbd } from '@relay/ui';
import { Fragment } from 'react';

const KEY_PATTERN = /\[([^\]]+)\]/;

export function KeyHint({ text }: { readonly text: string }) {
  const parts = text.split(KEY_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Kbd key={index} keys={[part]} />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
