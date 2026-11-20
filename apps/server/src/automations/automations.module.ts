import { Module } from '@nestjs/common';
import { AutomationHistoryController } from './automation-history.controller';
import { AutomationsController } from './automations.controller';

@Module({ controllers: [AutomationsController, AutomationHistoryController] })
export class AutomationsModule {}
