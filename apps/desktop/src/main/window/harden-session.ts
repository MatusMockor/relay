import type { Session } from 'electron';

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write']);

export const hardenSession = (session: Session): void => {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.setPermissionCheckHandler((_webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );
};
