export const SERVER_PORT_TOKENS = {
  UserRepository: Symbol.for('relay.server.UserRepository'),
  DeviceRepository: Symbol.for('relay.server.DeviceRepository'),
  RefreshTokenRepository: Symbol.for('relay.server.RefreshTokenRepository'),
  ServerUnitOfWork: Symbol.for('relay.server.ServerUnitOfWork'),
} as const;
