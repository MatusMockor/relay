import { Field, type FieldProps } from '@relay/ui';
import { useId } from 'react';

export interface ConnectInputProps extends FieldProps {
  readonly error: string | undefined;
}

export function ConnectInput({ error, ...field }: ConnectInputProps) {
  const errorId = `${useId()}-error`;
  return (
    <div className="ts-fld">
      <Field
        {...field}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
      />
      {error === undefined ? null : (
        <p id={errorId} className="ts-fld-err">
          {error}
        </p>
      )}
    </div>
  );
}
