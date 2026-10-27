import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeGateway } from '../../realtime/realtime.gateway.js';
import { QUEUE_HOLD_SWEEPER } from '../queues/queue.constants.js';

@Processor(QUEUE_HOLD_SWEEPER)
export class HoldSweeperProcessor extends WorkerHost {
  private readonly logger = new Logger(HoldSweeperProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ sweptCount: number }> {
    // this.logger.debug(`Running hold sweeper job #${job.id}...`);

    try {
      // Atomic query to sweep expired holds per DinkUp architecture:
      // Correctness does not depend on this job (the hold condition in holdSlot already frees it),
      // but this background worker tidies up stale holds and notifies connected browsers.
      const swept = await this.prisma.$queryRaw<
        Array<{
          id: number;
          court_id: number;
          date: Date;
        }>
      >`
        UPDATE tbl_slot
        SET status = 'AVAILABLE'::"SlotStatus",
            held_by = NULL,
            hold_expires_at = NULL,
            version = version + 1,
            updated_at = NOW()
        WHERE status = 'HELD'::"SlotStatus"
          AND hold_expires_at < NOW()
        RETURNING id, court_id, date;
      `;

      if (swept.length > 0) {
        this.logger.log(`Swept ${swept.length} expired slot hold(s)`);

        const sweptSlotIds = swept.map((s) => s.id);

        // Transition associated PENDING bookings to EXPIRED per DinkUp spec
        await this.prisma.$executeRaw`
          UPDATE tbl_booking
          SET status = 'EXPIRED'::"BookingStatus",
              updated_at = NOW()
          WHERE status = 'PENDING'::"BookingStatus"
            AND slot_id = ANY(${sweptSlotIds});
        `;

        for (const slot of swept) {
          const dateStr =
            slot.date instanceof Date
              ? slot.date.toISOString().split('T')[0]
              : String(slot.date);

          this.realtimeGateway.broadcastSlotReleased({
            slotId: slot.id,
            courtId: slot.court_id,
            date: dateStr,
          });
        }
      }

      return { sweptCount: swept.length };
    } catch (error) {
      this.logger.error('Error sweeping expired slot holds:', error);
      throw error;
    }
  }
}
