import type { DayGroup } from '../../lib/day-groups';

export function DayHeader({ group }: { readonly group: DayGroup }) {
  return (
    <div className="a-day">
      <span className="a-day-label">{group.label}</span>
      {group.date === null ? null : <span className="a-day-date">{group.date}</span>}
    </div>
  );
}
