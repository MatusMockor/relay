import type {
  AccountId,
  Automation,
  AutomationCondition,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type {
  AutomationCandidateRepository,
  InboxCandidate,
} from '../../ports/automation-candidate-repository';
import type { AutomationMatcher } from '../../ports/automation-matcher';
import type { JiraClassifier } from '../../ports/jira-classifier';
import type { MessageRepository } from '../../ports/message-repository';
import { classifyStored } from './stored-jira-classification';

export interface BacklogMatch {
  readonly accountId: AccountId;
  readonly threadId: ThreadId;
  readonly lastMessageAt: string;
  readonly messageIds: readonly MessageId[];
}

export interface AutomationBacklogMatcherDeps {
  readonly candidates: AutomationCandidateRepository;
  readonly messages: MessageRepository;
  readonly matcher: AutomationMatcher;
  readonly classifier: JiraClassifier;
}

const JIRA_CONDITIONS: readonly AutomationCondition['type'][] = ['jira', 'jiraEvent'];

const NO_JIRA = new Map<MessageId, JiraClassification | null>();

export class AutomationBacklogMatcher {
  constructor(private readonly deps: AutomationBacklogMatcherDeps) {}

  async inboxMatches(
    userId: UserId,
    accountId: AccountId,
    automation: Automation,
    limit: number,
  ): Promise<BacklogMatch[]> {
    const usesJira = automation.conditions.some((condition) =>
      JIRA_CONDITIONS.includes(condition.type),
    );
    const matches: BacklogMatch[] = [];
    for (const candidate of await this.deps.candidates.listInbox(accountId, limit)) {
      const jira = usesJira ? await this.jiraOf(userId, candidate) : NO_JIRA;
      const messageIds: MessageId[] = [];
      for (const { messageId, subject } of candidate.messages) {
        const matched = await this.deps.matcher.matches({
          message: subject,
          jira: jira.get(messageId) ?? null,
          conditions: automation.conditions,
        });
        if (matched) {
          messageIds.push(messageId);
        }
      }
      if (messageIds.length > 0) {
        matches.push({
          accountId,
          threadId: candidate.threadId,
          lastMessageAt: candidate.lastMessageAt,
          messageIds,
        });
      }
    }
    return matches;
  }

  private async jiraOf(
    userId: UserId,
    candidate: InboxCandidate,
  ): Promise<Map<MessageId, JiraClassification | null>> {
    if (candidate.jiraKey === null) {
      return NO_JIRA;
    }
    const headers = new Map(
      candidate.messages.map((item) => [item.messageId, item.subject.headers]),
    );
    const stored = await this.deps.messages.listByThread(userId, candidate.threadId);
    return classifyStored(
      this.deps.classifier,
      stored,
      (messageId) => headers.get(messageId) ?? new Map<string, string[]>(),
    );
  }
}
