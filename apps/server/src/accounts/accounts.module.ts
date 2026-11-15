import { Module } from '@nestjs/common';
import { AccountCreationService } from './account-creation.service';
import { AccountsController } from './accounts.controller';

@Module({ controllers: [AccountsController], providers: [AccountCreationService] })
export class AccountsModule {}
