import { Module } from '@nestjs/common';
import { AttachmentContentController } from './attachment-content.controller';
import { AttachmentsController } from './attachments.controller';

@Module({ controllers: [AttachmentsController, AttachmentContentController] })
export class AttachmentsModule {}
