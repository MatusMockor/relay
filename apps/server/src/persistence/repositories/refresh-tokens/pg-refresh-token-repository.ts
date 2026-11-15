import type { DeviceId } from '@relay/shared/domain';
import { and, eq, getTableColumns, gt, isNull, sql } from 'drizzle-orm';
import type { NewRefreshToken, RefreshTokenRecord } from '../../../core/model/refresh-token';
import type { RefreshTokenRepository } from '../../../core/ports/refresh-token-repository';
import type { DbExecutor } from '../../database/database';
import { devices, refreshTokens } from '../../schema';
import { toDate } from '../../support/timestamps';
import { toRefreshToken, toRefreshTokenInsert } from './refresh-token.mapper';

const FAMILY_LOCK_NAMESPACE = 7301;

const lockFamily = async (db: DbExecutor, familyId: string): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(${FAMILY_LOCK_NAMESPACE}, hashtext(${familyId}))`,
  );
};

export class PgRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: DbExecutor) {}

  async store(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const [row] = await this.db
      .insert(refreshTokens)
      .values(toRefreshTokenInsert(token))
      .returning();
    return row === undefined ? { ...token, rotatedAt: null, revokedAt: null } : toRefreshToken(row);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return row === undefined ? null : toRefreshToken(row);
  }

  async findValid(tokenHash: string, now: string): Promise<RefreshTokenRecord | null> {
    const [row] = await this.db
      .select(getTableColumns(refreshTokens))
      .from(refreshTokens)
      .innerJoin(devices, eq(devices.id, refreshTokens.deviceId))
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.rotatedAt),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, toDate(now)),
          isNull(devices.revokedAt),
        ),
      );
    return row === undefined ? null : toRefreshToken(row);
  }

  async rotate(
    currentId: string,
    next: NewRefreshToken,
    now: string,
  ): Promise<RefreshTokenRecord | null> {
    return this.db.transaction(async (tx) => {
      await lockFamily(tx, next.familyId);
      const rotated = await tx
        .update(refreshTokens)
        .set({ rotatedAt: toDate(now) })
        .where(
          and(
            eq(refreshTokens.id, currentId),
            eq(refreshTokens.familyId, next.familyId),
            isNull(refreshTokens.rotatedAt),
            isNull(refreshTokens.revokedAt),
          ),
        )
        .returning({ id: refreshTokens.id });
      if (rotated.length === 0) {
        return null;
      }
      return new PgRefreshTokenRepository(tx).store(next);
    });
  }

  async revokeFamily(familyId: string, revokedAt: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockFamily(tx, familyId);
      await tx
        .update(refreshTokens)
        .set({ revokedAt: toDate(revokedAt) })
        .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
    });
  }

  async revokeDevice(deviceId: DeviceId, revokedAt: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: toDate(revokedAt) })
      .where(and(eq(refreshTokens.deviceId, deviceId), isNull(refreshTokens.revokedAt)));
  }
}
