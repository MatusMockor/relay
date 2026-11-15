import type { NewRefreshToken, RefreshTokenRecord } from '../../../core/model/refresh-token';
import type { refreshTokens } from '../../schema';
import { toDate, toIso, toIsoOrNull } from '../../support/timestamps';

type RefreshTokenRow = typeof refreshTokens.$inferSelect;
type RefreshTokenInsert = typeof refreshTokens.$inferInsert;

export const toRefreshToken = (row: RefreshTokenRow): RefreshTokenRecord => ({
  id: row.id,
  userId: row.userId,
  deviceId: row.deviceId,
  familyId: row.familyId,
  tokenHash: row.tokenHash,
  expiresAt: toIso(row.expiresAt),
  createdAt: toIso(row.createdAt),
  rotatedAt: toIsoOrNull(row.rotatedAt),
  revokedAt: toIsoOrNull(row.revokedAt),
});

export const toRefreshTokenInsert = (token: NewRefreshToken): RefreshTokenInsert => ({
  id: token.id,
  userId: token.userId,
  deviceId: token.deviceId,
  familyId: token.familyId,
  tokenHash: token.tokenHash,
  expiresAt: toDate(token.expiresAt),
  createdAt: toDate(token.createdAt),
});
