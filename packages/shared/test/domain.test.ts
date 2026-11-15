import { describe, expect, it } from 'vitest';
import {
  AccountCredentialsSchema,
  AiJobInputSchema,
  AiOutputSchema,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_USER_SETTINGS,
  DeviceSettingsSchema,
  DraftContentSchema,
  ServerUrlSchema,
  SplitSchema,
  ThreadIdSchema,
  UserSettingsPatchSchema,
  UserSettingsSchema,
} from '../src/domain';

describe('domain schemas', () => {
  it('ships defaults that satisfy their own schemas', () => {
    expect(UserSettingsSchema.parse(DEFAULT_USER_SETTINGS)).toEqual(DEFAULT_USER_SETTINGS);
    expect(DeviceSettingsSchema.parse(DEFAULT_DEVICE_SETTINGS)).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('parses every split rule variant and rejects unknown ones', () => {
    const split = {
      id: 'spl_1',
      userId: 'usr_1',
      accountId: null,
      name: 'Jira',
      order: 0,
      exclusive: true,
      rules: [
        { type: 'fromDomain', domain: 'atlassian.net' },
        { type: 'fromAddress', address: 'jira@firma.sk' },
        { type: 'subjectRegex', pattern: '^\\[JIRA\\]', caseSensitive: false },
        { type: 'header', name: 'X-JIRA-FingerPrint', pattern: '.+' },
        { type: 'jira', projectKeys: ['REL'] },
      ],
    };
    expect(SplitSchema.safeParse(split).success).toBe(true);
    const unknownRule = { ...split, rules: [{ type: 'fromMoon' }] };
    expect(SplitSchema.safeParse(unknownRule).success).toBe(false);
  });

  it('distinguishes password and oauth credentials', () => {
    const password = AccountCredentialsSchema.parse({ kind: 'password', password: 'x' });
    expect(password.kind).toBe('password');
    const oauth = AccountCredentialsSchema.safeParse({ kind: 'oauth', provider: 'imap' });
    expect(oauth.success).toBe(false);
  });

  it('accepts partial settings patches', () => {
    const patch = UserSettingsPatchSchema.parse({ ai: { features: { jiraTriage: false } } });
    expect(patch).toEqual({ ai: { features: { jiraTriage: false } } });
  });

  it('rejects empty ids', () => {
    expect(ThreadIdSchema.safeParse('').success).toBe(false);
  });
});

describe('ids and server urls', () => {
  it('accepts only url-safe ids', () => {
    expect(ThreadIdSchema.safeParse('thr_01JABC-x').success).toBe(true);
    expect(ThreadIdSchema.safeParse('..').success).toBe(false);
    expect(ThreadIdSchema.safeParse('a/b').success).toBe(false);
  });

  it('rejects server urls with a query or fragment', () => {
    expect(ServerUrlSchema.safeParse('https://relay.example.com').success).toBe(true);
    expect(ServerUrlSchema.safeParse('https://relay.example.com/?tenant=1').success).toBe(false);
    expect(ServerUrlSchema.safeParse('ftp://relay.example.com').success).toBe(false);
  });

  it('defaults draft attachments to an empty list', () => {
    const draft = DraftContentSchema.parse({
      accountId: 'acc_1',
      to: [],
      cc: [],
      bcc: [],
      subject: 'Ahoj',
      body: '',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
    });
    expect(draft.attachments).toEqual([]);
  });
});

describe('ai contract', () => {
  it('keeps notifications off by default', () => {
    expect(DEFAULT_USER_SETTINGS.notifications).toBe('off');
  });

  it('parses createTask inputs and outputs', () => {
    expect(AiJobInputSchema.parse({ kind: 'createTask', threadId: 'thr_1', hint: null })).toEqual({
      kind: 'createTask',
      threadId: 'thr_1',
      hint: null,
    });
    expect(
      AiOutputSchema.parse({
        kind: 'createTask',
        threadId: 'thr_1',
        title: 'Zaplatiť',
        aiWhat: 'Do piatku.',
      }),
    ).toMatchObject({ kind: 'createTask', title: 'Zaplatiť' });
  });

  it('defaults chat answer references for results stored before they existed', () => {
    expect(AiOutputSchema.parse({ kind: 'chatAnswer', text: 'Ahoj' })).toEqual({
      kind: 'chatAnswer',
      text: 'Ahoj',
      references: [],
    });
    expect(
      AiOutputSchema.safeParse({ kind: 'chatAnswer', text: 'x', references: ['bad id!'] }).success,
    ).toBe(false);
  });
});
