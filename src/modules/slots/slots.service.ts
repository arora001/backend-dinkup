import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GenerateSlotsDto } from './dto/generate-slots.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { SlotStatus } from '../../common/enums/slot-status.enum.js';
import { DayOfWeek } from '../../generated/prisma/enums.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const JS_DAY_TO_ENUM: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async generateSlots(
    courtId: number,
    hostId: number,
    role: string,
    dto: GenerateSlotsDto,
  ) {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      include: {
        venue: true,
        schedules: true,
      },
    });

    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }

    if (role !== Role.ADMIN && court.venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to generate slots for this court',
      );
    }

    if (!court.schedules || court.schedules.length === 0) {
      throw new BadRequestException(
        'Court has no weekly schedule templates configured. Set schedules first.',
      );
    }

    const scheduleMap = new Map<DayOfWeek, (typeof court.schedules)[0]>();
    for (const schedule of court.schedules) {
      scheduleMap.set(schedule.dayOfWeek, schedule);
    }

    const start = dto.startDate ? new Date(dto.startDate) : new Date();
    // Normalize to midnight UTC
    start.setUTCHours(0, 0, 0, 0);

    const daysCount = dto.daysAhead ?? 7;
    const slotsToCreate: {
      courtId: number;
      date: Date;
      startTime: string;
      endTime: string;
      price: number;
      status: SlotStatus;
      version: number;
    }[] = [];

    for (let i = 0; i < daysCount; i++) {
      const targetDate = new Date(start);
      targetDate.setUTCDate(start.getUTCDate() + i);

      const dayEnum = JS_DAY_TO_ENUM[targetDate.getUTCDay()];
      const daySchedule = scheduleMap.get(dayEnum);

      if (!daySchedule) {
        // Court is closed on this day
        continue;
      }

      const openMin = this.timeToMinutes(daySchedule.openTime);
      const closeMin = this.timeToMinutes(daySchedule.closeTime);
      const duration = daySchedule.slotDurationMinutes || 60;
      const price = daySchedule.priceOverride ?? court.basePricePerHour;

      let current = openMin;
      while (current + duration <= closeMin) {
        slotsToCreate.push({
          courtId,
          date: targetDate,
          startTime: this.minutesToTime(current),
          endTime: this.minutesToTime(current + duration),
          price,
          status: SlotStatus.AVAILABLE,
          version: 0,
        });
        current += duration;
      }
    }

    if (slotsToCreate.length === 0) {
      return {
        message: 'No operating schedules matched the requested date range',
        courtId,
        generatedCount: 0,
      };
    }

    // Atomic bulk insert with skipDuplicates: true to preserve existing holds/bookings
    const result = await this.prisma.slot.createMany({
      data: slotsToCreate,
      skipDuplicates: true,
    });

    return {
      message: `Slots materialized successfully for court ${courtId}`,
      courtId,
      daysProcessed: daysCount,
      newSlotsCreated: result.count,
    };
  }

  async getSlotsByDate(courtId: number, dateStr: string) {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            city: true,
            area: true,
          },
        },
      },
    });

    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }

    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

    const slots = await this.prisma.slot.findMany({
      where: {
        courtId,
        date: targetDate,
      },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();

    // Map live status: if HELD but hold has expired, viewer sees it as AVAILABLE
    const liveSlots = slots.map((slot) => {
      let liveStatus = slot.status;
      if (
        slot.status === SlotStatus.HELD &&
        slot.holdExpiresAt &&
        slot.holdExpiresAt < now
      ) {
        liveStatus = SlotStatus.AVAILABLE;
      }

      return {
        id: slot.id,
        courtId: slot.courtId,
        date: dateStr,
        startTime: slot.startTime,
        endTime: slot.endTime,
        price: slot.price,
        status: liveStatus,
        holdExpiresAt: liveStatus === SlotStatus.HELD ? slot.holdExpiresAt : null,
        isHeldByMe: false, // Updated by caller if authenticated
      };
    });

    return {
      court: {
        id: court.id,
        name: court.name,
        venue: court.venue,
        basePricePerHour: court.basePricePerHour,
      },
      date: dateStr,
      slots: liveSlots,
    };
  }

  async holdSlot(slotId: number, userId: number) {
    // Single atomic conditional UPDATE statement per DinkUp specification:
    // Postgres row-level locking ensures that exactly 1 concurrent request wins the row
    const result = await this.prisma.$queryRaw<
      Array<{
        id: number;
        court_id: number;
        date: Date;
        status: string;
        hold_expires_at: Date;
        held_by: number;
        price: number;
      }>
    >`
      UPDATE tbl_slot
      SET status = 'HELD'::"SlotStatus",
          held_by = ${userId},
          hold_expires_at = NOW() + INTERVAL '5 minutes',
          version = version + 1,
          updated_at = NOW()
      WHERE id = ${slotId}
        AND (
          status = 'AVAILABLE'::"SlotStatus"
          OR (status = 'HELD'::"SlotStatus" AND hold_expires_at < NOW())
        )
      RETURNING id, court_id, date, status, hold_expires_at, held_by, price;
    `;

    if (result.length === 0) {
      // Check why the update failed so we return a clear exception
      const slot = await this.prisma.slot.findUnique({
        where: { id: slotId },
      });

      if (!slot) {
        throw new NotFoundException(`Slot with ID ${slotId} not found`);
      }

      if (slot.status === SlotStatus.BOOKED) {
        throw new ConflictException('This slot has already been booked');
      }

      if (slot.status === SlotStatus.BLOCKED) {
        throw new ConflictException('This slot is blocked by the venue host');
      }

      if (
        slot.status === SlotStatus.HELD &&
        slot.holdExpiresAt &&
        slot.holdExpiresAt >= new Date()
      ) {
        if (slot.heldBy === userId) {
          // Player already holds this slot
          return {
            message: 'You already hold this slot',
            slotId: slot.id,
            status: slot.status,
            holdExpiresAt: slot.holdExpiresAt,
            expiresInSeconds: Math.max(
              0,
              Math.floor((slot.holdExpiresAt.getTime() - Date.now()) / 1000),
            ),
          };
        }
        throw new ConflictException('This slot is currently held by another player');
      }

      throw new ConflictException('Slot is no longer available');
    }

    const held = result[0];
    const expiresInSeconds = Math.max(
      0,
      Math.floor((held.hold_expires_at.getTime() - Date.now()) / 1000),
    );

    const dateStr =
      held.date instanceof Date
        ? held.date.toISOString().split('T')[0]
        : String(held.date);

    this.realtimeGateway.broadcastSlotHeld({
      slotId: held.id,
      courtId: held.court_id,
      date: dateStr,
      holdExpiresAt: held.hold_expires_at,
      price: held.price,
    });

    return {
      message: 'Slot successfully held for 5 minutes',
      slotId: held.id,
      status: held.status,
      price: held.price,
      heldBy: held.held_by,
      holdExpiresAt: held.hold_expires_at,
      expiresInSeconds,
    };
  }

  async releaseSlot(slotId: number, userId: number, role: string) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: slotId },
    });

    if (!slot) {
      throw new NotFoundException(`Slot with ID ${slotId} not found`);
    }

    if (slot.status !== SlotStatus.HELD) {
      throw new BadRequestException('Slot is not currently in HELD status');
    }

    if (role !== Role.ADMIN && slot.heldBy !== userId) {
      throw new ForbiddenException('You cannot release a slot held by someone else');
    }

    const result = await this.prisma.$queryRaw<
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
      WHERE id = ${slotId} AND status = 'HELD'::"SlotStatus"
      RETURNING id, court_id, date;
    `;

    if (result.length > 0) {
      const released = result[0];
      const dateStr =
        released.date instanceof Date
          ? released.date.toISOString().split('T')[0]
          : String(released.date);

      this.realtimeGateway.broadcastSlotReleased({
        slotId: released.id,
        courtId: released.court_id,
        date: dateStr,
      });
    }

    return {
      message: 'Slot hold released successfully. Slot is now available.',
      slotId,
    };
  }

  async blockSlot(slotId: number, hostId: number, role: string) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        court: {
          include: { venue: true },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException(`Slot with ID ${slotId} not found`);
    }

    if (role !== Role.ADMIN && slot.court.venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to block slots on this court',
      );
    }

    if (slot.status === SlotStatus.BOOKED) {
      throw new BadRequestException('Cannot block an already booked slot');
    }

    const updated = await this.prisma.slot.update({
      where: { id: slotId },
      data: {
        status: SlotStatus.BLOCKED,
        heldBy: null,
        holdExpiresAt: null,
      },
    });

    const dateStr =
      updated.date instanceof Date
        ? updated.date.toISOString().split('T')[0]
        : String(updated.date);

    this.realtimeGateway.broadcastSlotBlocked({
      slotId: updated.id,
      courtId: updated.courtId,
      date: dateStr,
    });

    return {
      message: 'Slot blocked for maintenance/private event',
      slotId: updated.id,
      status: updated.status,
    };
  }

  async unblockSlot(slotId: number, hostId: number, role: string) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: slotId },
      include: {
        court: {
          include: { venue: true },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException(`Slot with ID ${slotId} not found`);
    }

    if (role !== Role.ADMIN && slot.court.venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to unblock slots on this court',
      );
    }

    if (slot.status !== SlotStatus.BLOCKED) {
      throw new BadRequestException('Slot is not currently blocked');
    }

    const updated = await this.prisma.slot.update({
      where: { id: slotId },
      data: {
        status: SlotStatus.AVAILABLE,
      },
    });

    const dateStr =
      updated.date instanceof Date
        ? updated.date.toISOString().split('T')[0]
        : String(updated.date);

    this.realtimeGateway.broadcastSlotReleased({
      slotId: updated.id,
      courtId: updated.courtId,
      date: dateStr,
    });

    return {
      message: 'Slot unblocked successfully and is now available for booking',
      slotId: updated.id,
      status: updated.status,
    };
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
