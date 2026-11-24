import { Global, Module } from '@nestjs/common';
import { PORT_TOKENS } from '@relay/engine';
import { createTaskSystemRegistry } from '@relay/task-systems';

@Global()
@Module({
  providers: [
    {
      provide: PORT_TOKENS.TaskSystemAdapterRegistry,
      useFactory: () => createTaskSystemRegistry(),
    },
  ],
  exports: [PORT_TOKENS.TaskSystemAdapterRegistry],
})
export class TaskSystemAdaptersModule {}
