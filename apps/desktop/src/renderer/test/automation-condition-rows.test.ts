import type { AutomationCondition } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { alignRows, initialRows } from '../src/features/settings/automations/condition-rows';

const tibor: AutomationCondition = { type: 'fromAddress', address: 'tibor@codevo.app' };
const firma: AutomationCondition = { type: 'fromDomain', domain: 'firma.sk' };
const files: AutomationCondition = { type: 'hasAttachment' };

describe('condition rows', () => {
  it('keeps row ids when a condition is replaced', () => {
    const rows = initialRows([tibor, firma], null);

    expect(alignRows(rows, [tibor, files]).ids).toEqual(rows.ids);
  });

  it('turns the new row into a saved one with the same id', () => {
    const rows = initialRows([tibor], 'fromDomain');
    const aligned = alignRows(rows, [tibor, firma]);

    expect(aligned.ids).toEqual([...rows.ids, rows.pending?.id]);
    expect(aligned.pending).toBeNull();
  });

  it('drops only the id of a removed condition', () => {
    const rows = initialRows([tibor, firma, files], null);

    expect(alignRows(rows, [tibor, files]).ids).toEqual([rows.ids[0], rows.ids[2]]);
  });

  it('starts over when the conditions change from elsewhere', () => {
    const rows = initialRows([tibor], null);
    const aligned = alignRows(rows, [firma, files, tibor]);

    expect(aligned.ids).toHaveLength(3);
    expect(aligned.ids).not.toContain(rows.ids[0]);
  });
});
