import type {
  AccountId,
  Automation,
  AutomationCondition,
  AutomationCriteria,
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
import { CANDIDATE_MESSAGE_BATCH } from './recent-candidates';
import { classifyStored } from './stored-jira-classification';

export interface BacklogMatch {
  readonly accountId: AccountId;
  readonly threadId: ThreadId;
  readonly lastMessageAt: string;
  readonly messageIds: readonly MessageId[];
}

export interface AutomationBacklogMatcherDeps {
  readonly candidates: AutomationCandidateRepository;
  readonly matcher: AutomationMatcher;
  readonly classifier: JiraClassifier;
}

const JIRA_CONDITIONS: readonly AutomationCondition['type'][] = ['jira', 'jiraEvent'];

export type JiraByMessage = ReadonlyMap<MessageId, JiraClassification | null>;

const NO_JIRA: JiraByMessage = new Map();

export const usesJira = (criteria: AutomationCriteria): boolean =>
  [...criteria.conditions, ...criteria.exceptions].some((condition) =>
    JIRA_CONDITIONS.includes(condition.type),
  );

const batchesOf = <Item>(items: readonly Item[], size: number): Item[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

export class AutomationBacklogMatcher {
  constructor(private readonly deps: AutomationBacklogMatcherDeps) {}

  async inboxMatches(
    userId: UserId,
    accountId: AccountId,
    automation: Automation,
    limit: number,
  ): Promise<BacklogMatch[]> {
    const candidates = await this.deps.candidates.listInbox(accountId, limit);
    return this.match(userId, accountId, candidates, automation);
  }

  async match(
    userId: UserId,
    accountId: AccountId,
    candidates: readonly InboxCandidate[],
    criteria: AutomationCriteria,
    known?: JiraByMessage,
  ): Promise<BacklogMatch[]> {
    const jira = known ?? (usesJira(criteria) ? await this.jiraOf(userId, candidates) : NO_JIRA);
    const matches: BacklogMatch[] = [];
    for (const candidate of candidates) {
      const messageIds: MessageId[] = [];
      for (const { messageId, subject } of candidate.messages) {
        const matched = await this.deps.matcher.matches({
          message: subject,
          jira: jira.get(messageId) ?? null,
          criteria,
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

  async jiraOf(userId: UserId, candidates: readonly InboxCandidate[]): Promise<JiraByMessage> {
    const subjects = candidates
      .filter((candidate) => candidate.jiraKey !== null)
      .flatMap((candidate) => candidate.messages);
    const headers = new Map(subjects.map((item) => [item.messageId, item.subject.headers]));
    const classified = new Map<MessageId, JiraClassification | null>();
    const ids = subjects.map((item) => item.messageId);
    for (const batch of batchesOf(ids, CANDIDATE_MESSAGE_BATCH)) {
      const stored = await this.deps.candidates.findMessages(userId, batch);
      const results = await classifyStored(
        this.deps.classifier,
        stored,
        (messageId) => headers.get(messageId) ?? new Map<string, string[]>(),
      );
      results.forEach((classification, messageId) => {
        classified.set(messageId, classification);
      });
    }
    return classified;
  }
}
