import { Module } from '@nestjs/common';
import { SplitsController } from './splits.controller';

@Module({ controllers: [SplitsController] })
export class SplitsModule {}
