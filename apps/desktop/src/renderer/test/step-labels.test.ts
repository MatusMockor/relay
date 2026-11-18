import { describe, expect, it } from 'vitest';
import { doneStepLabel } from '../src/features/side/step-labels';

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
});
