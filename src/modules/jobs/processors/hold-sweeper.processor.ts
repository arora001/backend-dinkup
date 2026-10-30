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

  async process(_job: Job): Promise<{ sweptSlotsCount: number; sweptSeatsCount: number }> {
    // this.logger.debug(`Running hold sweeper job #${job.id}...`);

    try {
      // 1. Atomic query to sweep expired slot holds per DinkUp architecture:
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

      // 2. Atomic query to sweep expired open game seat holds
      const sweptSeats = await this.prisma.$queryRaw<
        Array<{
          id: number;
          game_id: number;
          seat_number: number;
        }>
      >`
        UPDATE tbl_game_seat
        SET status = 'RELEASED'::"GameSeatStatus",
            updated_at = NOW()
        WHERE status = 'HELD'::"GameSeatStatus"
          AND hold_expires_at < NOW()
        RETURNING id, game_id, seat_number;
      `;

      if (sweptSeats.length > 0) {
        this.logger.log(`Swept ${sweptSeats.length} expired game seat hold(s)`);

        // Group by game_id to decrement seats_taken appropriately
        const seatsByGame = new Map<number, typeof sweptSeats>();
        for (const seat of sweptSeats) {
          const list = seatsByGame.get(seat.game_id) || [];
          list.push(seat);
          seatsByGame.set(seat.game_id, list);
        }

        for (const [gameId, seats] of seatsByGame.entries()) {
          const decrementCount = seats.length;
          const updatedGames = await this.prisma.$queryRaw<
            Array<{
              id: number;
              seats_taken: number;
              seats_total: number;
              status: string;
            }>
          >`
            UPDATE tbl_game
            SET seats_taken = GREATEST(1, seats_taken - ${decrementCount}),
                status = 'OPEN'::"GameStatus",
                version = version + 1,
                updated_at = NOW()
            WHERE id = ${gameId}
            RETURNING id, seats_taken, seats_total, status;
          `;

          if (updatedGames.length > 0) {
            const g = updatedGames[0];
            for (const s of seats) {
              this.realtimeGateway.broadcastSeatReleased({
                gameId,
                seatNumber: s.seat_number,
                seatsTaken: g.seats_taken,
                seatsTotal: g.seats_total,
                status: g.status,
              });
            }
          }
        }
      }

      return { sweptSlotsCount: swept.length, sweptSeatsCount: sweptSeats.length };
    } catch (error) {
      this.logger.error('Error sweeping expired slot or seat holds:', error);
      throw error;
    }
  }
}
