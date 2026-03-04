import { Module } from '@nestjs/common';
import { AppsListController } from './apps-list.controller';

@Module({
  controllers: [AppsListController],
})
export class AppsListModule {}
