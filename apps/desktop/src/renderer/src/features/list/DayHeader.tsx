import { type DayGroup, hasDayHeader } from '../../lib/day-groups';

export function DayHeader({ group }: { readonly group: DayGroup }) {
  if (!hasDayHeader(group)) {
    return null;
  }
  return (
    <div className="a-day">
      <span className="a-day-label">{group.label}</span>
      {group.date === null ? null : <span className="a-day-date">{group.date}</span>}
    </div>
  );
}
