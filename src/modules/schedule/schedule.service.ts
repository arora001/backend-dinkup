import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetWeeklyScheduleDto } from './dto/set-weekly-schedule.dto.js';
import { UpdateDayScheduleDto } from './dto/update-day-schedule.dto.js';
import { DayOfWeek } from '../../generated/prisma/enums.js';
import { Role } from '../../common/enums/role.enum.js';

const DAY_ORDER: Record<DayOfWeek, number> = {
  [DayOfWeek.MONDAY]: 1,
  [DayOfWeek.TUESDAY]: 2,
  [DayOfWeek.WEDNESDAY]: 3,
  [DayOfWeek.THURSDAY]: 4,
  [DayOfWeek.FRIDAY]: 5,
  [DayOfWeek.SATURDAY]: 6,
  [DayOfWeek.SUNDAY]: 7,
};

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async setWeeklySchedule(
    courtId: number,
    hostId: number,
    role: string,
    dto: SetWeeklyScheduleDto,
  ) {
    await this.verifyCourtOwnership(courtId, hostId, role);

    const expandedDays: {
      courtId: number;
      dayOfWeek: DayOfWeek;
      openTime: string;
      closeTime: string;
      slotDurationMinutes: number;
      priceOverride?: number;
    }[] = [];

    const seenDays = new Set<DayOfWeek>();

    for (const item of dto.schedules) {
      this.validateTimeWindow(item.openTime, item.closeTime);

      for (const day of item.daysOfWeek) {
        if (seenDays.has(day)) {
          throw new BadRequestException(
            `Duplicate schedule definition provided for ${day}`,
          );
        }
        seenDays.add(day);

        expandedDays.push({
          courtId,
          dayOfWeek: day,
          openTime: item.openTime,
          closeTime: item.closeTime,
          slotDurationMinutes: item.slotDurationMinutes ?? 60,
          priceOverride: item.priceOverride,
        });
      }
    }

    const daysToUpsert = Array.from(seenDays);

    // Atomically replace existing schedules for the specified days
    await this.prisma.$transaction([
      this.prisma.schedule.deleteMany({
        where: {
          courtId,
          dayOfWeek: { in: daysToUpsert },
        },
      }),
      this.prisma.schedule.createMany({
        data: expandedDays,
      }),
    ]);

    return this.findByCourt(courtId);
  }

  async findByCourt(courtId: number) {
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

    const schedules = await this.prisma.schedule.findMany({
      where: { courtId },
    });

    // Sort Monday -> Sunday
    const sortedSchedules = schedules.sort(
      (a, b) => DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek],
    );

    return {
      court: {
        id: court.id,
        name: court.name,
        venue: court.venue,
        basePricePerHour: court.basePricePerHour,
      },
      schedules: sortedSchedules,
    };
  }

  async updateDay(
    courtId: number,
    dayOfWeek: DayOfWeek,
    hostId: number,
    role: string,
    dto: UpdateDayScheduleDto,
  ) {
    await this.verifyCourtOwnership(courtId, hostId, role);

    const existing = await this.prisma.schedule.findUnique({
      where: {
        courtId_dayOfWeek: {
          courtId,
          dayOfWeek,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Schedule for court ${courtId} on ${dayOfWeek} not found`,
      );
    }

    const effectiveOpen = dto.openTime ?? existing.openTime;
    const effectiveClose = dto.closeTime ?? existing.closeTime;
    this.validateTimeWindow(effectiveOpen, effectiveClose);

    return this.prisma.schedule.update({
      where: {
        courtId_dayOfWeek: {
          courtId,
          dayOfWeek,
        },
      },
      data: dto,
    });
  }

  async removeDay(
    courtId: number,
    dayOfWeek: DayOfWeek,
    hostId: number,
    role: string,
  ) {
    await this.verifyCourtOwnership(courtId, hostId, role);

    const existing = await this.prisma.schedule.findUnique({
      where: {
        courtId_dayOfWeek: {
          courtId,
          dayOfWeek,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Schedule for court ${courtId} on ${dayOfWeek} not found`,
      );
    }

    await this.prisma.schedule.delete({
      where: {
        courtId_dayOfWeek: {
          courtId,
          dayOfWeek,
        },
      },
    });

    return {
      message: `Operating schedule for ${dayOfWeek} removed successfully (Court marked closed on ${dayOfWeek})`,
      courtId,
      dayOfWeek,
    };
  }

  private async verifyCourtOwnership(
    courtId: number,
    hostId: number,
    role: string,
  ) {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      include: { venue: true },
    });

    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }

    if (role !== Role.ADMIN && court.venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to manage schedules for this court',
      );
    }

    return court;
  }

  private validateTimeWindow(openTime: string, closeTime: string) {
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (openMinutes >= closeMinutes) {
      throw new BadRequestException(
        `Invalid operating hours: openTime (${openTime}) must be before closeTime (${closeTime})`,
      );
    }
  }
}
