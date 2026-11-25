import { Controller } from '@nestjs/common';
import { AccountOrderService, AccountService } from '@relay/engine';
import { api, type OkResponse, type TestConnectionResponse } from '@relay/shared/api';
import type { MailAccount, Mailbox } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';
import { AccountCreationService } from './account-creation.service';

@Controller()
export class AccountsController {
  constructor(
    private readonly accounts: AccountService,
    private readonly order: AccountOrderService,
    private readonly creation: AccountCreationService,
  ) {}

  @ApiRoute(api.accounts.list)
  list(@CurrentPrincipal() principal: Principal): Promise<MailAccount[]> {
    return this.accounts.list(principal.userId);
  }

  @ApiRoute(api.accounts.create)
  create(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.accounts.create) request: RequestOf<typeof api.accounts.create>,
  ): Promise<MailAccount> {
    return this.creation.create(principal.userId, request.body);
  }

  @ApiRoute(api.accounts.testConnection)
  testConnection(
    @ApiRequest(api.accounts.testConnection)
    request: RequestOf<typeof api.accounts.testConnection>,
  ): Promise<TestConnectionResponse> {
    return this.accounts.testConnection(request.body);
  }

  @ApiRoute(api.accounts.update)
  update(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.accounts.update) request: RequestOf<typeof api.accounts.update>,
  ): Promise<MailAccount> {
    return this.accounts.update(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(api.accounts.reorder)
  reorder(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.accounts.reorder) request: RequestOf<typeof api.accounts.reorder>,
  ): Promise<MailAccount[]> {
    return this.order.reorder(principal.userId, request.body.accountIds);
  }

  @ApiRoute(api.accounts.remove)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.accounts.remove) request: RequestOf<typeof api.accounts.remove>,
  ): Promise<OkResponse> {
    await this.accounts.remove(principal.userId, request.params.id);
    return { ok: true };
  }

  @ApiRoute(api.accounts.mailboxes)
  mailboxes(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.accounts.mailboxes) request: RequestOf<typeof api.accounts.mailboxes>,
  ): Promise<Mailbox[]> {
    return this.accounts.mailboxes(principal.userId, request.params.id);
  }
}
