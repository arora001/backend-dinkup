import { Module } from '@nestjs/common';
import { CourtsService } from './courts.service.js';
import { CourtsController } from './courts.controller.js';

@Module({
  controllers: [CourtsController],
  providers: [CourtsService],
  exports: [CourtsService],
})
export class CourtsModule {}
