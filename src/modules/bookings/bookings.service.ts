import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { BookingQueryDto } from './dto/booking-query.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { SlotStatus } from '../../common/enums/slot-status.enum.js';
import { BookingStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Unified Option A: Hold-and-Book
   * 1. If slot is already HELD by user and valid, reuses it.
   * 2. If slot is AVAILABLE (or expired hold), atomically claims the 5-min hold.
   * 3. Calculates cancellation cutoff based on venue policy.
   * 4. Generates unique reference code and inserts tbl_booking (status: PENDING).
   * 5. Emits real-time slot:held event via Socket.IO.
   */
  async createBooking(
    userId: number,
    dto: CreateBookingDto,
    idempotencyKey?: string,
  ) {
    const slot = await this.prisma.slot.findUnique({
      where: { id: dto.slotId },
      include: {
        court: {
          include: { venue: true },
        },
        bookings: {
          where: {
            status: {
              in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
            },
          },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException(`Slot with ID ${dto.slotId} not found`);
    }

    if (slot.status === SlotStatus.BOOKED) {
      throw new ConflictException('This slot has already been booked');
    }

    if (slot.status === SlotStatus.BLOCKED) {
      throw new ConflictException('This slot is blocked by the venue host');
    }

    // Check if there is an active booking on this slot
    const activeBooking = slot.bookings[0];
    if (activeBooking) {
      if (activeBooking.status === BookingStatus.CONFIRMED) {
        throw new ConflictException('This slot has already been booked');
      }

      // If pending booking exists:
      if (activeBooking.status === BookingStatus.PENDING) {
        if (
          activeBooking.userId === userId &&
          slot.heldBy === userId &&
          slot.holdExpiresAt &&
          slot.holdExpiresAt > new Date()
        ) {
          // Idempotent re-entry: player already holds this slot and has pending booking
          const expiresInSeconds = Math.max(
            0,
            Math.floor((slot.holdExpiresAt.getTime() - Date.now()) / 1000),
          );

          return {
            message: 'Booking reservation retrieved',
            booking: activeBooking,
            expiresInSeconds,
          };
        }

        // Held by another player
        if (slot.holdExpiresAt && slot.holdExpiresAt > new Date()) {
          throw new ConflictException(
            'This slot is currently being booked by another player',
          );
        }
      }
    }

    let holdExpiresAt: Date;

    // Case 1: Slot was already placed on hold by this user via holdSlot
    if (
      slot.status === SlotStatus.HELD &&
      slot.heldBy === userId &&
      slot.holdExpiresAt &&
      slot.holdExpiresAt > new Date()
    ) {
      holdExpiresAt = slot.holdExpiresAt;
    } else {
      // Case 2: Atomic conditional UPDATE per DinkUp spec
      const updated = await this.prisma.$queryRaw<
        Array<{
          id: number;
          court_id: number;
          date: Date;
          hold_expires_at: Date;
          price: number;
        }>
      >`
        UPDATE tbl_slot
        SET status = 'HELD'::"SlotStatus",
            held_by = ${userId},
            hold_expires_at = NOW() + INTERVAL '5 minutes',
            version = version + 1,
            updated_at = NOW()
        WHERE id = ${dto.slotId}
          AND (
            status = 'AVAILABLE'::"SlotStatus"
            OR (status = 'HELD'::"SlotStatus" AND hold_expires_at < NOW())
          )
        RETURNING id, court_id, date, hold_expires_at, price;
      `;

      if (updated.length === 0) {
        throw new ConflictException(
          'Slot is no longer available. Another player just held this slot.',
        );
      }

      holdExpiresAt = updated[0].hold_expires_at;
    }

    // Calculate cancellation cutoff = slot start minus venue cancellationCutoffHours
    const cancellationCutoff = this.calculateCancellationCutoff(
      slot.date,
      slot.startTime,
      slot.court.venue.cancellationCutoffHours,
    );

    const bookingReference = this.generateBookingReference();

    const booking = await this.prisma.booking.create({
      data: {
        bookingReference,
        userId,
        slotId: slot.id,
        courtId: slot.courtId,
        venueId: slot.court.venueId,
        status: BookingStatus.PENDING,
        totalPrice: slot.price,
        cancellationCutoff,
        idempotencyKey,
      },
      include: {
        slot: true,
        court: true,
        venue: true,
      },
    });

    const dateStr =
      slot.date instanceof Date
        ? slot.date.toISOString().split('T')[0]
        : String(slot.date);

    // Broadcast live WebSocket event so other browsers see the slot turn into HELD state
    this.realtimeGateway.broadcastSlotHeld({
      slotId: slot.id,
      courtId: slot.courtId,
      date: dateStr,
      holdExpiresAt,
      price: slot.price,
    });

    const expiresInSeconds = Math.max(
      0,
      Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000),
    );

    return {
      message:
        'Booking initiated. Please complete payment within 5 minutes to confirm.',
      booking,
      expiresInSeconds,
    };
  }

  /**
   * List authenticated player's bookings
   */
  async findMyBookings(userId: number, query: BookingQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          slot: true,
          court: true,
          venue: {
            include: {
              images: {
                where: { isCover: true },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    return {
      data: bookings,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Fetch single booking by ID with authorization check
   */
  async findOne(bookingId: number, userId: number, role: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: true,
        court: true,
        venue: {
          include: {
            images: {
              where: { isCover: true },
              take: 1,
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID #${bookingId} not found`);
    }

    // Access control: Player owner, venue host owner, or Admin
    if (
      role !== Role.ADMIN &&
      booking.userId !== userId &&
      booking.venue.hostId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view this booking',
      );
    }

    return booking;
  }

  /**
   * Cancel booking before cutoff
   */
  async cancelBooking(
    bookingId: number,
    userId: number,
    role: string,
    dto: CancelBookingDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: true,
        venue: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID #${bookingId} not found`);
    }

    if (
      role !== Role.ADMIN &&
      booking.userId !== userId &&
      booking.venue.hostId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to cancel this booking',
      );
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.EXPIRED) {
      throw new BadRequestException(
        'Booking has expired and cannot be cancelled',
      );
    }

    // Enforce cancellation policy: check if current time passed cutoff
    if (
      role !== Role.ADMIN &&
      booking.cancellationCutoff &&
      new Date() > booking.cancellationCutoff
    ) {
      throw new BadRequestException(
        `Cancellation cutoff has passed. Free cancellation was allowed up to ${booking.venue.cancellationCutoffHours} hours before the slot.`,
      );
    }

    // Atomic transaction: mark booking CANCELLED and reset slot to AVAILABLE
    const [updatedBooking] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason || 'Cancelled by player',
        },
      }),
      this.prisma.slot.update({
        where: { id: booking.slotId },
        data: {
          status: SlotStatus.AVAILABLE,
          heldBy: null,
          holdExpiresAt: null,
        },
      }),
    ]);

    const dateStr =
      booking.slot.date instanceof Date
        ? booking.slot.date.toISOString().split('T')[0]
        : String(booking.slot.date);

    // Broadcast live event: slot is freed
    this.realtimeGateway.broadcastSlotReleased({
      slotId: booking.slotId,
      courtId: booking.courtId,
      date: dateStr,
    });

    return {
      message: 'Booking cancelled successfully. Court slot is now available.',
      booking: updatedBooking,
    };
  }

  /**
   * Confirm booking (used by payment webhook & dev testing)
   */
  async confirmBooking(bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { slot: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID #${bookingId} not found`);
    }

    if (booking.status === BookingStatus.CONFIRMED) {
      return { message: 'Booking is already confirmed', booking };
    }

    // Atomic confirmation
    const [confirmed] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
        },
      }),
      this.prisma.slot.update({
        where: { id: booking.slotId },
        data: {
          status: SlotStatus.BOOKED,
          heldBy: null,
          holdExpiresAt: null,
        },
      }),
    ]);

    const dateStr =
      booking.slot.date instanceof Date
        ? booking.slot.date.toISOString().split('T')[0]
        : String(booking.slot.date);

    // Broadcast live WebSocket event: slot is booked
    this.realtimeGateway.broadcastSlotBooked({
      slotId: booking.slotId,
      courtId: booking.courtId,
      date: dateStr,
    });

    return {
      message: 'Booking confirmed successfully',
      booking: confirmed,
    };
  }

  private calculateCancellationCutoff(
    date: Date,
    startTime: string,
    cutoffHours: number,
  ): Date {
    const [h, m] = startTime.split(':').map(Number);
    const slotDateTime = new Date(date);
    slotDateTime.setUTCHours(h, m, 0, 0);

    return new Date(slotDateTime.getTime() - cutoffHours * 60 * 60 * 1000);
  }

  private generateBookingReference(): string {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomHex = randomBytes(2).toString('hex').toUpperCase();

    return `DNK-${yy}${mm}${dd}-${randomHex}`;
  }
}
