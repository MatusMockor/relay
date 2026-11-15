export const PASSWORD_HASHER = Symbol.for('relay.server.PasswordHasher');

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyAgainstDummy(password: string): Promise<void>;
}
