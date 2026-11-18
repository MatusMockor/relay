export function UpdateTooltip({
  label,
  detail,
  detailId,
}: {
  readonly label: string;
  readonly detail: string | null;
  readonly detailId: string;
}) {
  return (
    <span className="upd-tip" role="tooltip">
      {label}
      {detail !== null && (
        <span id={detailId} className="upd-tip-detail">
          {detail}
        </span>
      )}
    </span>
  );
}
