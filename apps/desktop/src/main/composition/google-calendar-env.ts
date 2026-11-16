type Env = Readonly<Record<string, string | undefined>>;

const positiveInt = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const googleCalendarEnv = (env: Env) => {
  const apiUrl = env.RELAY_GOOGLE_CALENDAR_API_URL?.trim();
  const syncSeconds = positiveInt(env.RELAY_GOOGLE_CALENDAR_SYNC_SECONDS);
  return {
    adapters: apiUrl === undefined || apiUrl === '' ? {} : { apiUrl },
    engine: syncSeconds === null ? {} : { googleSyncSeconds: syncSeconds },
  };
};
