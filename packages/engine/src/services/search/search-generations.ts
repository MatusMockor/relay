import type { UserId } from '@relay/shared/domain';

export class SearchGenerations {
  private readonly current = new Map<UserId, number>();

  next(userId: UserId): number {
    const generation = (this.current.get(userId) ?? 0) + 1;
    this.current.set(userId, generation);
    return generation;
  }

  isCurrent(userId: UserId, generation: number): boolean {
    return this.current.get(userId) === generation;
  }
}
