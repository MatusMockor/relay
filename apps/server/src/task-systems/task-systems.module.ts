import { Module } from '@nestjs/common';
import { TaskSystemsController } from './task-systems.controller';

@Module({ controllers: [TaskSystemsController] })
export class TaskSystemsModule {}
