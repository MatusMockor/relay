const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function UpdateProgressRing({ percent }: { readonly percent: number }) {
  const offset = CIRCUMFERENCE * (1 - percent / 100);
  return (
    <svg className="upd-ring" viewBox="0 0 30 30" aria-hidden="true">
      <circle className="upd-ring-track" cx="15" cy="15" r={RADIUS} />
      <circle
        className="upd-ring-bar"
        cx="15"
        cy="15"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
