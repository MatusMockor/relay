import type { ReactNode } from 'react';
import { expandCollapsed, toggleCollapsed, useUiStore } from '../../state/ui-store';
import { type SectionAdd, SectionHeading, type SectionHeadingLevel } from './SectionHeading';

interface SidebarSectionProps {
  readonly Heading: SectionHeadingLevel;
  readonly title: string;
  readonly collapseKey: string;
  readonly add: SectionAdd;
  readonly children: ReactNode;
}

export function SidebarSection({
  Heading,
  title,
  collapseKey,
  add,
  children,
}: SidebarSectionProps) {
  const shut = useUiStore((state) => state.collapsed[collapseKey] === true);
  return (
    <>
      <SectionHeading
        Heading={Heading}
        title={title}
        shut={shut}
        onToggle={() => {
          toggleCollapsed(collapseKey);
        }}
        add={{
          ...add,
          onAdd: () => {
            expandCollapsed(collapseKey);
            add.onAdd();
          },
        }}
      />
      {shut ? null : children}
    </>
  );
}
