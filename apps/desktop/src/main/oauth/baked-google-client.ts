import type { GoogleClientValues } from './provided-google-client-config';

export const bakedGoogleClient: GoogleClientValues = {
  clientId: import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_ID,
  clientSecret: import.meta.env.RELAY_BAKED_GOOGLE_CLIENT_SECRET,
};
