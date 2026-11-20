import type { AutomationPreviewSample } from '@relay/shared';
import { listTimeLabel } from '../../../lib/dates';

const senderOf = (sample: AutomationPreviewSample): string =>
  sample.from?.name ?? sample.from?.email ?? 'Neznámy odosielateľ';

export function PreviewSampleList({
  samples,
}: {
  readonly samples: readonly AutomationPreviewSample[];
}) {
  if (samples.length === 0) {
    return null;
  }
  return (
    <ul className="au-prev-l" aria-label="Ukážka zachytených mailov">
      {samples.map((sample) => (
        <li key={sample.threadId}>
          <b>{senderOf(sample)}</b>
          <span>{sample.subject === '' ? '(bez predmetu)' : sample.subject}</span>
          <time dateTime={sample.date}>{listTimeLabel(sample.date, new Date())}</time>
        </li>
      ))}
    </ul>
  );
}
