import type { Repositories } from '@relay/engine';
import type { DeviceRepository } from './device-repository';
import type { RefreshTokenRepository } from './refresh-token-repository';
import type { UserRepository } from './user-repository';

export interface ServerRepositories extends Repositories {
  readonly users: UserRepository;
  readonly devices: DeviceRepository;
  readonly refreshTokens: RefreshTokenRepository;
}

export interface ServerUnitOfWork {
  run<Result>(work: (repositories: ServerRepositories) => Promise<Result>): Promise<Result>;
}
