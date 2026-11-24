import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createMailUser, deleteMailUser, mailUserOf } from '../greenmail/greenmail-users';
import type { MailUser } from '../greenmail/mail-user';
import { resetMailboxes } from '../greenmail/mailbox-reset';
import { largeAccount } from './large-account';
import { seedMailbox } from './mail-seeder';
import type { SeedScenario } from './seed-message';
import { smallInbox } from './small-inbox';

const ratio = z.coerce.number().min(0).max(1).optional();

const ArgsSchema = z.object({
  scenario: z.enum(['small', 'large']).default('small'),
  count: z.coerce.number().int().min(1).max(100_000).default(1_000),
  'reply-ratio': ratio,
  'archive-ratio': ratio,
  user: z.string().optional(),
  password: z.string().optional(),
  reset: z.boolean().default(false),
  delete: z.boolean().default(false),
});

type Args = z.infer<typeof ArgsSchema>;

const { values } = parseArgs({
  options: {
    scenario: { type: 'string' },
    count: { type: 'string' },
    'reply-ratio': { type: 'string' },
    'archive-ratio': { type: 'string' },
    user: { type: 'string' },
    password: { type: 'string' },
    reset: { type: 'boolean' },
    delete: { type: 'boolean' },
  },
  allowPositionals: false,
});

const scenarioOf = (args: Args, owner: string): SeedScenario => {
  if (args.scenario === 'small') {
    return smallInbox(owner);
  }
  return largeAccount(owner, {
    count: args.count,
    replyRatio: args['reply-ratio'],
    archiveRatio: args['archive-ratio'],
  });
};

const existingUser = (args: Args): MailUser | null => {
  if (args.user === undefined) {
    return null;
  }
  return mailUserOf(args.user, args.password ?? '');
};

const main = async (): Promise<void> => {
  const args = ArgsSchema.parse(values);
  const existing = existingUser(args);
  if (args.delete && existing !== null) {
    await deleteMailUser(existing.email);
    console.log(`Deleted ${existing.email}`);
    return;
  }
  if (args.reset && existing !== null) {
    await resetMailboxes(existing);
  }
  const user = existing ?? (await createMailUser(`seed-${args.scenario}`));
  const started = Date.now();
  const seeded = await seedMailbox(user, scenarioOf(args, user.email), (done, total) => {
    console.error(`seeded ${String(done)}/${String(total)}`);
  });
  console.error(`Seeded ${String(seeded)} messages in ${String(Date.now() - started)} ms`);
  console.log(JSON.stringify(user, null, 2));
};

await main();
