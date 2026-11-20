import { api } from '@relay/shared';
import { MailClientError } from '../errors';
import type { Organizer } from '../MailClient';
import type { HttpApi } from './HttpApi';

export const OUTDATED_HISTORY =
  'Server je starší a nepodporuje históriu pravidla. Aktualizuj server.';

const isMissingRoute = (error: unknown): boolean =>
  error instanceof MailClientError && error.status === 404 && error.message.startsWith('Cannot ');

const outdatedHistory = (error: unknown): unknown =>
  isMissingRoute(error)
    ? new MailClientError({ code: 'not_implemented', message: OUTDATED_HISTORY }, 404)
    : error;

const checked = <Result>(request: Promise<Result>): Promise<Result> =>
  request.catch((error: unknown) => {
    throw outdatedHistory(error);
  });

export const createRemoteAutomationHistory = (
  http: HttpApi,
): Pick<Organizer, 'automationHistory' | 'undoAutomationActivity' | 'undoAutomationSince'> => ({
  automationHistory: (id) => checked(http.call(api.automationHistory.history, { params: { id } })),
  undoAutomationActivity: (id, entryId) =>
    checked(http.call(api.automationHistory.undoEntry, { params: { id, entryId } })),
  undoAutomationSince: (id, since) =>
    checked(http.call(api.automationHistory.undoSince, { params: { id }, body: { since } })),
});
