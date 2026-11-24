import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { JiraClassifier } from '../../ports/jira-classifier';
import type { MessageParser } from '../../ports/message-parser';
import type { MessageRepository } from '../../ports/message-repository';
import type { SplitMatcher } from '../../ports/split-matcher';
import type { ThreadResolver } from '../../ports/thread-resolver';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { CalendarPartsSink } from './calendar-parts-sink';
import type { MessageLabelsResolver } from './message-labels-resolver';
import type { RemoteBodyFill } from './remote-body-fill';

export interface MessageIngestorDeps {
  readonly messages: MessageRepository;
  readonly unitOfWork: UnitOfWork;
  readonly parser: MessageParser;
  readonly threadResolver: ThreadResolver;
  readonly jiraClassifier: JiraClassifier;
  readonly splitMatcher: SplitMatcher;
  readonly labelsResolver: MessageLabelsResolver;
  readonly ids: IdGenerator;
  readonly calendarParts: CalendarPartsSink;
  readonly clock: Clock;
  readonly bodyFill?: RemoteBodyFill;
}
