import type {
  Clock,
  ConditionalCredentialVault,
  IdGenerator,
  JiraClassifier,
  MailProviderFactory,
  MailSender,
  MessageParser,
  MessageRepository,
  SplitMatcher,
  ThreadResolver,
} from '@relay/engine';
import {
  DefaultMailProviderFactory,
  MailparserMessageParser,
  MessageRepositoryThreadLookup,
  ReferencesThreadResolver,
  RefreshingOAuthTokenProvider,
  RuleJiraClassifier,
  RuleSplitMatcher,
  SmtpMailSender,
} from '@relay/mail-core';
import type { GoogleClientConfigSource } from '../oauth/google-client-config-source';
import { LazyGoogleTokenRefresher } from '../oauth/lazy-google-token-refresher';

export interface MailAdaptersInput {
  readonly vault: ConditionalCredentialVault;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly messages: MessageRepository;
  readonly googleClient: GoogleClientConfigSource;
  readonly allowPlaintext: boolean;
}

export interface MailAdapters {
  readonly mailProviderFactory: MailProviderFactory;
  readonly mailSender: MailSender;
  readonly messageParser: MessageParser;
  readonly threadResolver: ThreadResolver;
  readonly jiraClassifier: JiraClassifier;
  readonly splitMatcher: SplitMatcher;
}

export const createMailAdapters = (input: MailAdaptersInput): MailAdapters => {
  const tokens = new RefreshingOAuthTokenProvider({
    refreshers: { gmail: new LazyGoogleTokenRefresher(input.googleClient, input.clock) },
    vault: input.vault,
    clock: input.clock,
  });
  return {
    mailProviderFactory: new DefaultMailProviderFactory({
      tokens,
      allowPlaintext: input.allowPlaintext,
    }),
    mailSender: new SmtpMailSender({ tokens, allowPlaintext: input.allowPlaintext }),
    messageParser: new MailparserMessageParser(input.clock),
    threadResolver: new ReferencesThreadResolver(
      new MessageRepositoryThreadLookup(input.messages),
      input.ids,
    ),
    jiraClassifier: new RuleJiraClassifier(),
    splitMatcher: new RuleSplitMatcher(),
  };
};
