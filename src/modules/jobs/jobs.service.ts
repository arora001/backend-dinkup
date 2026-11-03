import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { HoldSweeperProcessor } from './processors/hold-sweeper.processor.js';
import { SlotGeneratorProcessor } from './processors/slot-generator.processor.js';

@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly holdSweeper: HoldSweeperProcessor,
    private readonly slotGenerator: SlotGeneratorProcessor,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Initializing scheduled background tasks...');
    this.logger.log('✓ Hold sweeper registered (in-memory interval: every 30 seconds)');
    this.logger.log('✓ Slot generator registered (in-memory cron: daily at 00:00 UTC)');

    // Run an initial sweep on bootstrap to ensure stale holds from downtime are freed immediately
    try {
      await this.holdSweeper.process();
    } catch (error) {
      this.logger.warn('Initial hold sweep on bootstrap encountered an error:', error);
    }
  }

  /**
   * Manually trigger an immediate hold sweep job
   */
  async triggerHoldSweep() {
    return this.holdSweeper.process();
  }

  /**
   * Manually trigger an immediate slot generation job
   */
  async triggerSlotGeneration(daysAhead = 14) {
    return this.slotGenerator.process({ daysAhead });
  }
}
