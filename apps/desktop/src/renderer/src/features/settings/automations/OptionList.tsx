import { Icon } from '@relay/ui';

export interface ListOption {
  readonly key: string;
  readonly label: string;
  readonly checked?: boolean;
  readonly pick: () => void;
}

export function OptionList({
  title,
  options,
}: {
  readonly title: string;
  readonly options: readonly ListOption[];
}) {
  return (
    <div role="group" aria-label={title}>
      <div className="grp">{title}</div>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={option.checked === true ? 'pi cur' : 'pi'}
          aria-pressed={option.checked ?? false}
          onClick={option.pick}
        >
          <span className="lb">{option.label}</span>
          {option.checked === true ? (
            <span className="ck">
              <Icon name="check" />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
