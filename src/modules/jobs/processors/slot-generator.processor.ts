import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DayOfWeek } from '../../../generated/prisma/enums.js';
import { SlotStatus } from '../../../common/enums/slot-status.enum.js';

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
export class SlotGeneratorProcessor {
  private readonly logger = new Logger(SlotGeneratorProcessor.name);
  private isRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * *') // Daily at midnight (00:00 UTC)
  async handleCron(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      await this.process();
    } catch (err) {
      this.logger.error('Error during scheduled daily slot generation:', err);
    } finally {
      this.isRunning = false;
    }
  }

  async process(options?: { daysAhead?: number }): Promise<{ generatedCount: number }> {
    const daysAhead = options?.daysAhead ?? 14;
    this.logger.log(`Running slot generator for the next ${daysAhead} days...`);

    try {
      const courts = await this.prisma.court.findMany({
        where: {
          isActive: true,
          venue: { isActive: true },
        },
        include: {
          schedules: true,
        },
      });

      if (courts.length === 0) {
        this.logger.log('No active courts found to generate slots for.');
        return { generatedCount: 0 };
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      let totalGenerated = 0;

      for (const court of courts) {
        if (!court.schedules || court.schedules.length === 0) {
          continue;
        }

        const scheduleMap = new Map<DayOfWeek, (typeof court.schedules)[0]>();
        for (const schedule of court.schedules) {
          scheduleMap.set(schedule.dayOfWeek, schedule);
        }

        const slotsToCreate: {
          courtId: number;
          date: Date;
          startTime: string;
          endTime: string;
          price: number;
          status: SlotStatus;
          version: number;
        }[] = [];

        for (let i = 0; i < daysAhead; i++) {
          const targetDate = new Date(today);
          targetDate.setUTCDate(today.getUTCDate() + i);

          const dayEnum = JS_DAY_TO_ENUM[targetDate.getUTCDay()];
          const daySchedule = scheduleMap.get(dayEnum);

          if (!daySchedule) {
            continue;
          }

          const openMin = this.timeToMinutes(daySchedule.openTime);
          const closeMin = this.timeToMinutes(daySchedule.closeTime);
          const duration = daySchedule.slotDurationMinutes || 60;
          const price = daySchedule.priceOverride ?? court.basePricePerHour;

          let current = openMin;
          while (current + duration <= closeMin) {
            slotsToCreate.push({
              courtId: court.id,
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

        if (slotsToCreate.length > 0) {
          const result = await this.prisma.slot.createMany({
            data: slotsToCreate,
            skipDuplicates: true,
          });
          totalGenerated += result.count;
        }
      }

      this.logger.log(
        `Slot generation complete: Created ${totalGenerated} new slots across ${courts.length} courts.`,
      );
      return { generatedCount: totalGenerated };
    } catch (error) {
      this.logger.error('Error generating court slots:', error);
      throw error;
    }
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
