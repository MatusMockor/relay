import { Global, Module } from '@nestjs/common';
import {
  type Clock,
  type ConditionalCredentialVault,
  type IdGenerator,
  type MessageRepository,
  PORT_TOKENS,
} from '@relay/engine';
import {
  DefaultMailProviderFactory,
  FetchUnsubscribeSender,
  MailparserAttachmentExtractor,
  MailparserMessageParser,
  MessageRepositoryThreadLookup,
  type OAuthTokenProvider,
  ReferencesThreadResolver,
  RuleJiraClassifier,
  RuleAutomationMatcher,
  RuleSplitMatcher,
  SmtpMailSender,
} from '@relay/mail-core';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { GoogleCodeExchanger } from './google-code-exchanger';
import { OAUTH_CODE_EXCHANGER } from './oauth-code-exchanger';
import { createOAuthTokenProvider } from './oauth-token-provider.factory';

const OAUTH_TOKEN_PROVIDER = Symbol.for('relay.server.OAuthTokenProvider');

@Global()
@Module({
  providers: [
    {
      provide: OAUTH_TOKEN_PROVIDER,
      inject: [SERVER_CONFIG, PORT_TOKENS.CredentialVault, PORT_TOKENS.Clock],
      useFactory: (config: ServerConfig, vault: ConditionalCredentialVault, clock: Clock) =>
        createOAuthTokenProvider(config.google, vault, clock),
    },
    {
      provide: PORT_TOKENS.MailProviderFactory,
      inject: [OAUTH_TOKEN_PROVIDER, SERVER_CONFIG],
      useFactory: (tokens: OAuthTokenProvider, config: ServerConfig) =>
        new DefaultMailProviderFactory({ tokens, allowPlaintext: config.mail.allowPlaintext }),
    },
    {
      provide: PORT_TOKENS.MailSender,
      inject: [OAUTH_TOKEN_PROVIDER, SERVER_CONFIG],
      useFactory: (tokens: OAuthTokenProvider, config: ServerConfig) =>
        new SmtpMailSender({ tokens, allowPlaintext: config.mail.allowPlaintext }),
    },
    {
      provide: PORT_TOKENS.MessageParser,
      inject: [PORT_TOKENS.Clock],
      useFactory: (clock: Clock) => new MailparserMessageParser(clock),
    },
    {
      provide: PORT_TOKENS.ThreadResolver,
      inject: [PORT_TOKENS.MessageRepository, PORT_TOKENS.IdGenerator],
      useFactory: (messages: MessageRepository, ids: IdGenerator) =>
        new ReferencesThreadResolver(new MessageRepositoryThreadLookup(messages), ids),
    },
    {
      provide: PORT_TOKENS.AttachmentExtractor,
      useFactory: () => new MailparserAttachmentExtractor(),
    },
    { provide: PORT_TOKENS.UnsubscribeSender, useFactory: () => new FetchUnsubscribeSender() },
    { provide: PORT_TOKENS.JiraClassifier, useFactory: () => new RuleJiraClassifier() },
    { provide: PORT_TOKENS.SplitMatcher, useFactory: () => new RuleSplitMatcher() },
    { provide: PORT_TOKENS.AutomationMatcher, useFactory: () => new RuleAutomationMatcher() },
    {
      provide: OAUTH_CODE_EXCHANGER,
      inject: [SERVER_CONFIG, PORT_TOKENS.Clock],
      useFactory: (config: ServerConfig, clock: Clock) =>
        new GoogleCodeExchanger(config.google, clock),
    },
  ],
  exports: [
    PORT_TOKENS.MailProviderFactory,
    PORT_TOKENS.MailSender,
    PORT_TOKENS.MessageParser,
    PORT_TOKENS.AttachmentExtractor,
    PORT_TOKENS.UnsubscribeSender,
    PORT_TOKENS.ThreadResolver,
    PORT_TOKENS.JiraClassifier,
    PORT_TOKENS.SplitMatcher,
    PORT_TOKENS.AutomationMatcher,
    OAUTH_CODE_EXCHANGER,
  ],
})
export class MailModule {}
