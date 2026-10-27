import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { RealtimeModule } from '../realtime/realtime.module.js';
import {
  QUEUE_HOLD_SWEEPER,
  QUEUE_SLOT_GENERATOR,
} from './queues/queue.constants.js';
import { HoldSweeperProcessor } from './processors/hold-sweeper.processor.js';
import { SlotGeneratorProcessor } from './processors/slot-generator.processor.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const rawUrl =
          config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        const parsed = new URL(rawUrl);

        return {
          connection: {
            host: parsed.hostname,
            port: Number(parsed.port) || 6379,
            username: parsed.username || undefined,
            password: parsed.password || undefined,
            tls: parsed.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_HOLD_SWEEPER },
      { name: QUEUE_SLOT_GENERATOR },
    ),
    RealtimeModule,
  ],
  providers: [HoldSweeperProcessor, SlotGeneratorProcessor, JobsService],
  exports: [JobsService, BullModule],
})
export class JobsModule {}
