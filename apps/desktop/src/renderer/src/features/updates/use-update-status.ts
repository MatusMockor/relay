import type { UpdateStatus } from '@relay/shared';
import { useEffect, useState } from 'react';
import type { Platform } from '../../platform/Platform';

export const useUpdateStatus = (platform: Platform): UpdateStatus | null => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => platform.subscribeToUpdates(setStatus), [platform]);
  return status;
};
