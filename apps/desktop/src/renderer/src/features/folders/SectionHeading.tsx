import { Icon } from '@relay/ui';

export type SectionHeadingLevel = 'h5' | 'h6';

export interface SectionAdd {
  readonly title: string;
  readonly label: string;
  readonly onAdd: () => void;
}

interface SectionHeadingProps {
  readonly Heading: SectionHeadingLevel;
  readonly title: string;
  readonly shut: boolean;
  readonly onToggle: () => void;
  readonly add: SectionAdd;
}

export function SectionHeading({ Heading, title, shut, onToggle, add }: SectionHeadingProps) {
  return (
    <div className="ft-head">
      <Heading>
        <button
          type="button"
          className={`ft-sec${shut ? ' shut' : ''}`}
          aria-expanded={!shut}
          onClick={onToggle}
        >
          {title}
          <Icon name="down" size={10} />
        </button>
      </Heading>
      <button
        type="button"
        className="ft-add"
        title={add.title}
        aria-label={add.label}
        onClick={add.onAdd}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}
