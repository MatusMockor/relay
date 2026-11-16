import { Module } from '@nestjs/common';
import { AttachmentContentController } from './attachment-content.controller';
import { AttachmentSweepScheduler } from './attachment-sweep-scheduler';
import { DraftAttachmentsController } from './draft-attachments.controller';

@Module({
  controllers: [AttachmentContentController, DraftAttachmentsController],
  providers: [AttachmentSweepScheduler],
})
export class AttachmentsModule {}
