import { describe, expect, it } from 'vitest';
import { MarkFolderReadBodySchema } from '../src/api';

describe('MarkFolderReadBodySchema', () => {
  it.each(['inbox', 'tasks', 'reminders', 'done', 'sent', 'trash', 'spam'] as const)(
    'accepts the %s view',
    (view) => {
      expect(MarkFolderReadBodySchema.safeParse({ view }).success).toBe(true);
    },
  );

  it.each(['drafts', 'scheduled'] as const)('rejects the %s view without read state', (view) => {
    const parsed = MarkFolderReadBodySchema.safeParse({ view });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([['view']]);
  });

  it('requires a mailbox or label target', () => {
    expect(MarkFolderReadBodySchema.safeParse({ view: 'mailbox' }).success).toBe(false);
    expect(MarkFolderReadBodySchema.safeParse({ view: 'label' }).success).toBe(false);
    expect(
      MarkFolderReadBodySchema.safeParse({ view: 'mailbox', mailboxId: 'mbx_1' }).success,
    ).toBe(true);
    expect(MarkFolderReadBodySchema.safeParse({ view: 'label', labelId: 'lbl_1' }).success).toBe(
      true,
    );
  });
});
