import { Module } from '@nestjs/common';
import { DraftsController } from './drafts.controller';
import { SendingController } from './sending.controller';

@Module({ controllers: [DraftsController, SendingController] })
export class ComposeModule {}
