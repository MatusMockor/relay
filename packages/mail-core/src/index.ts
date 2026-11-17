export type { MailAuth, MailAuthResolver } from './auth/mail-auth';
export type { OAuthTokenProvider, OAuthTokenRefresher } from './auth/oauth-token-provider';
export { CredentialsMailAuthResolver } from './auth/credentials-mail-auth-resolver';
export {
  RefreshingOAuthTokenProvider,
  type RefreshingOAuthTokenProviderOptions,
} from './auth/refreshing-oauth-token-provider';
export {
  type KeyedCredentialStore,
  RefreshingOAuthTokens,
  type RefreshingOAuthTokensOptions,
} from './auth/refreshing-oauth-tokens';
export {
  type CalendarAccessTokenSource,
  GoogleCalendarAccessTokens,
  type GoogleCalendarAccessTokensOptions,
} from './auth/google/google-calendar-access-tokens';
export {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_IDENTITY_SCOPES,
  GOOGLE_MAIL_SCOPES,
  type GoogleScopeRequest,
  googleScopesFor,
  GOOGLE_TOKEN_ENDPOINT,
  type GoogleOAuthClientConfig,
} from './auth/google/google-oauth-config';
export { buildGoogleAuthUrl, type GoogleAuthUrlInput } from './auth/google/google-auth-url';
export {
  exchangeGoogleCode,
  type ExchangeGoogleCodeInput,
  type GoogleCodeExchangeResult,
} from './auth/google/exchange-google-code';
export { GoogleOAuthTokenRefresher } from './auth/google/google-oauth-token-refresher';
export { type FetchFunction, GoogleTokenRejectedError } from './auth/google/google-token-endpoint';
export {
  createOAuthState,
  createPkceChallenge,
  createPkcePair,
  type PkcePair,
} from './auth/google/pkce';

export {
  DEFAULT_IMAP_TIMEOUTS,
  ImapClientFactory,
  type ImapClientSettings,
  type ImapTimeouts,
} from './imap/imap-client-factory';
export { ImapMailProvider, type ImapMailProviderOptions } from './imap/imap-mail-provider';
export { PartialMoveError, UidValidityChangedError } from '@relay/engine';
export { DEFAULT_IDLE_OPTIONS, type IdleWatcherOptions } from './imap/idle-watcher';
export { detectMailboxRole, type MailboxRoleInput } from './imap/mailbox-roles';
export {
  DefaultMailProviderFactory,
  type DefaultMailProviderFactoryOptions,
} from './factory/default-mail-provider-factory';

export { SmtpMailSender, type SmtpMailSenderOptions } from './smtp/smtp-mail-sender';
export { DEFAULT_SMTP_TIMEOUTS, type SmtpTimeouts } from './smtp/smtp-transport';
export { composeMime, type ComposedMime } from './smtp/compose-mime';

export { extractAttachment, type ExtractedAttachment } from './parser/extract-attachment';
export { MailparserAttachmentExtractor } from './parser/mailparser-attachment-extractor';
export { MailparserMessageParser } from './parser/mailparser-message-parser';
export {
  HttpsUnsubscribeSender,
  type HttpsUnsubscribeSenderOptions,
} from './unsubscribe/https-unsubscribe-sender';
export {
  createPinnedHttpsTransport,
  type PinnedHttpsTransportOptions,
  type PinnedRequest,
  pinnedLookup,
  type UnsubscribeTransport,
} from './unsubscribe/pinned-https-transport';
export { type HostResolver, type ResolvedAddress } from './unsubscribe/public-host-guard';
export { buildSnippet, htmlToText, SNIPPET_LENGTH } from './parser/snippet';

export { normalizeSubject, type NormalizedSubject } from './threading/normalize-subject';
export type { SubjectWindow, ThreadLookup } from './threading/thread-lookup';
export { MessageRepositoryThreadLookup } from './threading/message-repository-thread-lookup';
export {
  ReferencesThreadResolver,
  relatedMessageIds,
  type ReferencesThreadResolverOptions,
} from './threading/references-thread-resolver';

export { RuleJiraClassifier } from './jira/rule-jira-classifier';
export type { JiraSenderConfig } from './jira/jira-detection';
export { extractJiraKey } from './jira/jira-key';
export { detectJiraEventKind } from './jira/jira-event-kind';
export { extractJiraActor } from './jira/jira-actor';

export { RuleAutomationMatcher } from './splits/rule-automation-matcher';
export { RuleSplitMatcher } from './splits/rule-split-matcher';
export { isUnsafeRegex, MAX_MATCH_INPUT_LENGTH } from './splits/regex-safety';

export * from './presets';
