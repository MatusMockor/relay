import type { EngineDeps } from '../../engine-deps';
import { attachmentReferenceLockFor } from './attachment-reference-lock';
import { attachmentSweepOptions } from './attachment-sweep-options';
import { AttachmentSweeper } from './attachment-sweeper';

export const createAttachmentSweeper = (deps: EngineDeps): AttachmentSweeper =>
  new AttachmentSweeper({
    blobs: deps.attachmentBlobs,
    lock: attachmentReferenceLockFor(deps.attachmentBlobs),
    clock: deps.clock,
    logger: deps.logger.child({ component: 'AttachmentSweeper' }),
    options: attachmentSweepOptions(deps.options.attachments),
  });
