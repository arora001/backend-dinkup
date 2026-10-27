import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_HOLD_SWEEPER,
  QUEUE_SLOT_GENERATOR,
} from './queues/queue.constants.js';

@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QUEUE_HOLD_SWEEPER)
    private readonly holdSweeperQueue: Queue,
    @InjectQueue(QUEUE_SLOT_GENERATOR)
    private readonly slotGeneratorQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Initializing BullMQ repeatable job schedulers...');

    try {
      // 1. Hold Sweeper: Sweeps expired 5-minute holds every 30 seconds
      await this.holdSweeperQueue.upsertJobScheduler(
        'sweep-expired-holds-scheduler',
        { every: 30000 },
        {
          name: 'sweep-expired-holds',
          opts: {
            removeOnComplete: true,
            removeOnFail: 100,
          },
        },
      );
      this.logger.log(
        '✓ Hold sweeper scheduler registered (running every 30 seconds)',
      );

      // 2. Slot Generator: Generates slots for the next 14 days daily at midnight (00:00 UTC)
      await this.slotGeneratorQueue.upsertJobScheduler(
        'generate-daily-slots-scheduler',
        { pattern: '0 0 * * *' },
        {
          name: 'generate-daily-slots',
          data: { daysAhead: 14 },
          opts: {
            removeOnComplete: true,
            removeOnFail: 50,
          },
        },
      );
      this.logger.log(
        '✓ Slot generator scheduler registered (running daily at 00:00 UTC for 14 days ahead)',
      );
    } catch (error) {
      this.logger.error('Failed to configure BullMQ job schedulers:', error);
    }
  }

  /**
   * Manually trigger an immediate hold sweep job
   */
  async triggerHoldSweep() {
    return this.holdSweeperQueue.add(
      'manual-hold-sweep',
      {},
      { removeOnComplete: true },
    );
  }

  /**
   * Manually trigger an immediate slot generation job
   */
  async triggerSlotGeneration(daysAhead = 14) {
    return this.slotGeneratorQueue.add(
      'manual-slot-generation',
      { daysAhead },
      { removeOnComplete: true },
    );
  }
}
