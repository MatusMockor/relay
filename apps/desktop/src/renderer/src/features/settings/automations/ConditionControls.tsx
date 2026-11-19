export interface ConditionSelectProps<Value extends string> {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly Value[];
  readonly labels: Readonly<Record<Value, string>>;
  readonly disabled: boolean;
  readonly onChange: (value: Value) => void;
}

export function ConditionSelect<Value extends string>({
  label,
  value,
  options,
  labels,
  disabled,
  onChange,
}: ConditionSelectProps<Value>) {
  return (
    <select
      className="au-in"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = options.find((option) => option === event.target.value);
        if (next !== undefined) {
          onChange(next);
        }
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}

export interface ConditionTextProps {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly readOnly: boolean;
  readonly autoFocus: boolean;
  readonly onChange: (value: string) => void;
  readonly onCommit: (strict: boolean) => void;
}

export function ConditionText({
  label,
  placeholder,
  value,
  readOnly,
  autoFocus,
  onChange,
  onCommit,
}: ConditionTextProps) {
  return (
    <input
      className="au-in"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      readOnly={readOnly}
      autoFocus={autoFocus}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onBlur={() => {
        onCommit(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        onCommit(true);
      }}
    />
  );
}
