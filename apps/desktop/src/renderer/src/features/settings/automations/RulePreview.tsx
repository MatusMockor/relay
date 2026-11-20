import type { AutomationPreviewResponse, AutomationPreviewSample } from '@relay/shared';
import { MailClientError } from '../../../data/errors';
import { listTimeLabel } from '../../../lib/dates';
import { plural } from '../../../lib/text';
import { useRulePreview } from './use-rule-preview';
import type { RuleInput } from './editable-rule';

const countLabel = ({ count, days, truncated }: AutomationPreviewResponse): string =>
  `Zachytí ${truncated ? 'aspoň ' : ''}${String(count)} ${plural(count, 'mail', 'maily', 'mailov')} za posledných ${String(days)} dní`;

const errorLabel = (error: unknown): string =>
  error instanceof MailClientError && error.code === 'not_implemented'
    ? error.message
    : 'Náhľad sa nepodarilo načítať.';

const senderOf = (sample: AutomationPreviewSample): string =>
  sample.from?.name ?? sample.from?.email ?? 'Neznámy odosielateľ';

export function RulePreview({ input }: { readonly input: RuleInput }) {
  const { enabled, invalid, waiting, query } = useRulePreview(input);
  if (!enabled) {
    return null;
  }
  if (invalid) {
    return (
      <section className="au-prev" aria-label="Náhľad pravidla">
        <p className="au-prev-h">
          Náhľad sa nedá spočítať. Pravidlo môže mať najviac 20 podmienok a 20 výnimiek.
        </p>
      </section>
    );
  }
  const { data } = query;
  const busy = waiting || query.isFetching;
  return (
    <section className="au-prev" aria-label="Náhľad pravidla" aria-busy={busy}>
      {data === undefined && query.isError ? (
        <p className="au-prev-h">{errorLabel(query.error)}</p>
      ) : null}
      {data === undefined && !query.isError ? <p className="au-prev-h">Počítam náhľad…</p> : null}
      {data === undefined ? null : (
        <>
          <p className="au-prev-h" aria-live="polite">
            {countLabel(data)}
          </p>
          {data.samples.length === 0 ? null : (
            <ul className="au-prev-l" aria-label="Ukážka zachytených mailov">
              {data.samples.map((sample) => (
                <li key={sample.threadId}>
                  <b>{senderOf(sample)}</b>
                  <span>{sample.subject === '' ? '(bez predmetu)' : sample.subject}</span>
                  <time dateTime={sample.date}>{listTimeLabel(sample.date, new Date())}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
