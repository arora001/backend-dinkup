import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { HoldSweeperProcessor } from './processors/hold-sweeper.processor.js';
import { SlotGeneratorProcessor } from './processors/slot-generator.processor.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [PrismaModule, RealtimeModule],
  providers: [HoldSweeperProcessor, SlotGeneratorProcessor, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
