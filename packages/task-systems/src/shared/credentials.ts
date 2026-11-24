import { type TaskSystemAccess, ValidationError } from '@relay/engine';
import {
  isCredentialsOf,
  type TaskSystemCredentialsOf,
  type TaskSystemProvider,
} from '@relay/shared/domain';

export const credentialsOf = <Provider extends TaskSystemProvider>(
  access: TaskSystemAccess,
  provider: Provider,
): TaskSystemCredentialsOf<Provider> => {
  const { credentials } = access;
  if (!isCredentialsOf(credentials, provider)) {
    throw new ValidationError('Prihlasovacie údaje nepatria k tomuto systému úloh.');
  }
  return credentials;
};
