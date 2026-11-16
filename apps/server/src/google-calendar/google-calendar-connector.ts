import { Inject, Injectable } from '@nestjs/common';
import { GoogleCalendarService, ValidationError } from '@relay/engine';
import type { OAuthGrant } from '@relay/shared/api';
import {
  EmailAddressSchema,
  type GoogleCalendarConnection,
  type UserId,
} from '@relay/shared/domain';
import { OAUTH_CODE_EXCHANGER, type OAuthCodeExchanger } from '../mail/oauth-code-exchanger';

@Injectable()
export class GoogleCalendarConnector {
  constructor(
    private readonly google: GoogleCalendarService,
    @Inject(OAUTH_CODE_EXCHANGER) private readonly oauth: OAuthCodeExchanger,
  ) {}

  async connect(userId: UserId, grant: OAuthGrant): Promise<GoogleCalendarConnection> {
    const exchanged = await this.oauth.exchangeGoogle(grant);
    const email = EmailAddressSchema.safeParse(exchanged.email);
    if (!email.success) {
      throw new ValidationError('Google nevrátil e-mailovú adresu účtu');
    }
    return this.google.connect(userId, { email: email.data, credentials: exchanged.credentials });
  }
}
