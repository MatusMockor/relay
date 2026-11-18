import { describe, expect, it } from 'vitest';
import { doneStepLabel, finishedStepLabel } from '../src/features/side/step-labels';

describe('finished AI step labels', () => {
  it('turns running tool steps into past tense without an ellipsis', () => {
    expect(doneStepLabel('Hľadám v pošte…')).toBe('Pošta prehľadaná');
    expect(doneStepLabel('Čítam vlákno…')).toBe('Vlákno prečítané');
  });

  it('describes the runner start as done', () => {
    expect(doneStepLabel('Spúšťam Claude Code')).toBe('Spustené cez Claude Code');
  });

  it('drops the ellipsis from unknown steps', () => {
    expect(doneStepLabel('search_web…')).toBe('search_web');
    expect(doneStepLabel('list_labels')).toBe('list_labels');
  });

  it('falls back for labels that only exist on the object prototype', () => {
    expect(doneStepLabel('constructor')).toBe('constructor');
    expect(doneStepLabel('toString')).toBe('toString');
  });

  it('never claims that a draft or task exists, because the run reports no tool result', () => {
    expect(finishedStepLabel('Pripravujem koncept…', 'done')).toBe('Príprava konceptu');
    expect(finishedStepLabel('Pripravujem koncept…', 'error')).toBe('Príprava konceptu');
    expect(finishedStepLabel('Vytváram úlohu…', 'done')).toBe('Vytváranie úlohy');
    expect(finishedStepLabel('Pripravujem koncept…', 'running')).toBe('Pripravujem koncept…');
    expect(finishedStepLabel('Hľadám v pošte…', 'error')).toBe('Pošta prehľadaná');
  });
});
