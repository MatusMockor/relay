import type { LabelId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { overlayFlags, overlayLabels, pendingOverrides } from '../../src';
import { KEEPER, T1, T2, work } from '../support/merge-fixtures';

const LABEL_IDS = new Map([
  ['Faktúry', 'lbl_invoices' as LabelId],
  ['VIP', 'lbl_vip' as LabelId],
]);

describe('pending overrides on merge', () => {
  const ops = [
    work(
      'provider-op',
      `${KEEPER}:flag:seen`,
      { messageId: KEEPER, change: { kind: 'flag', flag: 'seen', value: false } },
      T2,
    ),
    work(
      'provider-op',
      `${KEEPER}:label:VIP`,
      { messageId: KEEPER, change: { kind: 'label', label: 'VIP', value: true } },
      T1,
    ),
    work(
      'provider-op',
      `${KEEPER}:label:Faktúry`,
      { messageId: KEEPER, change: { kind: 'label', label: 'Faktúry', value: false } },
      T1,
    ),
    work(
      'provider-op',
      `${KEEPER}:label:Unknown`,
      { messageId: KEEPER, change: { kind: 'label', label: 'Unknown', value: true } },
      T1,
    ),
    work('provider-op', `${KEEPER}:move`, {
      messageId: KEEPER,
      change: { kind: 'move', role: 'archive' },
    }),
  ];

  it("overrides the keeper's flags with pending flag ops only", () => {
    const overrides = pendingOverrides(ops);

    expect(overrides.flags).toEqual({ seen: false });
    expect(overlayFlags({ seen: true, flagged: true, answered: true }, overrides)).toEqual({
      seen: false,
      flagged: true,
      answered: true,
    });
  });

  it("overrides the keeper's labels with pending label ops of known labels", () => {
    const overrides = pendingOverrides(ops);
    const current = ['lbl_invoices' as LabelId, 'lbl_work' as LabelId];

    expect(overlayLabels(current, overrides, (name) => LABEL_IDS.get(name))).toEqual([
      'lbl_work',
      'lbl_vip',
    ]);
  });
});
