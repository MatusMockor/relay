import { Module } from '@nestjs/common';
import { SyncNowService } from './sync-now.service';
import { SyncController } from './sync.controller';

@Module({ controllers: [SyncController], providers: [SyncNowService] })
export class SyncModule {}
