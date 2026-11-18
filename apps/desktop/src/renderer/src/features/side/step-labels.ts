import type { TurnStatus } from './chat-store';

const OUTCOME: ReadonlyMap<string, string> = new Map([
  ['Vytváram úlohu…', 'Vytváranie úlohy'],
  ['Pripravujem koncept…', 'Príprava konceptu'],
]);

const DONE: ReadonlyMap<string, string> = new Map([
  ['Hľadám v pošte…', 'Pošta prehľadaná'],
  ['Čítam vlákno…', 'Vlákno prečítané'],
  ['Prechádzam priečinok…', 'Priečinok prejdený'],
  ['Pozerám úlohy…', 'Úlohy skontrolované'],
  ['Pozerám kalendár…', 'Kalendár skontrolovaný'],
  ['Pozerám udalosť vo vlákne…', 'Udalosť vo vlákne skontrolovaná'],
  ...OUTCOME,
]);

const STARTED = /^Spúšťam (.+)$/;

export const doneStepLabel = (step: string): string => {
  const known = DONE.get(step);
  if (known !== undefined) {
    return known;
  }
  const started = STARTED.exec(step);
  if (started !== null) {
    return `Spustené cez ${started[1] ?? ''}`;
  }
  return step.replace(/…$/, '');
};

export const finishedStepLabel = (step: string, status: TurnStatus): string =>
  status === 'running' && OUTCOME.has(step) ? step : doneStepLabel(step);
