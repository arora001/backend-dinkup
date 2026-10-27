import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { BookingStatus, Role, SlotStatus } from '../../generated/prisma/enums.js';

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: any;
  let realtimeGateway: any;

  const mockDate = new Date('2026-10-30T00:00:00.000Z');

  const mockSlot = {
    id: 10,
    courtId: 2,
    date: mockDate,
    startTime: '18:00',
    endTime: '19:00',
    price: 800,
    status: SlotStatus.AVAILABLE,
    heldBy: null,
    holdExpiresAt: null,
    version: 0,
    court: {
      id: 2,
      venueId: 5,
      venue: {
        id: 5,
        hostId: 99,
        cancellationCutoffHours: 6,
      },
    },
    bookings: [],
  };

  beforeEach(() => {
    prisma = {
      slot: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      booking: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;

    realtimeGateway = {
      broadcastSlotHeld: jest.fn(),
      broadcastSlotReleased: jest.fn(),
      broadcastSlotBooked: jest.fn(),
    } as unknown as jest.Mocked<RealtimeGateway>;

    service = new BookingsService(prisma, realtimeGateway);
  });

  describe('createBooking (Option A)', () => {
    it('creates a PENDING booking and holds slot for 5 minutes', async () => {
      prisma.slot.findUnique.mockResolvedValue(mockSlot as any);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 10,
          court_id: 2,
          date: mockDate,
          hold_expires_at: new Date(Date.now() + 300000),
          price: 800,
        },
      ]);

      const mockCreatedBooking = {
        id: 101,
        bookingReference: 'DNK-261027-ABCD',
        userId: 1,
        slotId: 10,
        courtId: 2,
        venueId: 5,
        status: BookingStatus.PENDING,
        totalPrice: 800,
        cancellationCutoff: new Date('2026-10-30T12:00:00.000Z'),
        slot: mockSlot,
        court: mockSlot.court,
        venue: mockSlot.court.venue,
      };

      prisma.booking.create.mockResolvedValue(mockCreatedBooking as any);

      const result = await service.createBooking(1, { slotId: 10 });

      expect(result.booking.status).toBe(BookingStatus.PENDING);
      expect(result.expiresInSeconds).toBeGreaterThan(0);
      expect(realtimeGateway.broadcastSlotHeld).toHaveBeenCalled();
    });

    it('throws ConflictException if slot is already BOOKED', async () => {
      prisma.slot.findUnique.mockResolvedValue({
        ...mockSlot,
        status: SlotStatus.BOOKED,
      } as any);

      await expect(service.createBooking(1, { slotId: 10 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException if slot does not exist', async () => {
      prisma.slot.findUnique.mockResolvedValue(null);

      await expect(service.createBooking(1, { slotId: 999 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancelBooking', () => {
    it('cancels booking and resets slot to AVAILABLE if before cutoff', async () => {
      const futureCutoff = new Date(Date.now() + 1000 * 60 * 60 * 10); // 10 hours from now
      const mockBooking = {
        id: 101,
        userId: 1,
        slotId: 10,
        courtId: 2,
        venueId: 5,
        status: BookingStatus.CONFIRMED,
        cancellationCutoff: futureCutoff,
        venue: { hostId: 99, cancellationCutoffHours: 6 },
        slot: mockSlot,
      };

      prisma.booking.findUnique.mockResolvedValue(mockBooking as any);
      prisma.$transaction.mockResolvedValue([
        { ...mockBooking, status: BookingStatus.CANCELLED },
        { ...mockSlot, status: SlotStatus.AVAILABLE },
      ]);

      const result = await service.cancelBooking(101, 1, Role.PLAYER, {
        reason: 'Change of plans',
      });

      expect(result.booking.status).toBe(BookingStatus.CANCELLED);
      expect(realtimeGateway.broadcastSlotReleased).toHaveBeenCalledWith({
        slotId: 10,
        courtId: 2,
        date: expect.any(String),
      });
    });

    it('throws BadRequestException if cancellation cutoff has passed', async () => {
      const pastCutoff = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const mockBooking = {
        id: 101,
        userId: 1,
        slotId: 10,
        cancellationCutoff: pastCutoff,
        status: BookingStatus.CONFIRMED,
        venue: { hostId: 99, cancellationCutoffHours: 6 },
        slot: mockSlot,
      };

      prisma.booking.findUnique.mockResolvedValue(mockBooking as any);

      await expect(
        service.cancelBooking(101, 1, Role.PLAYER, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmBooking', () => {
    it('moves booking to CONFIRMED and slot to BOOKED', async () => {
      const mockBooking = {
        id: 101,
        slotId: 10,
        courtId: 2,
        status: BookingStatus.PENDING,
        slot: mockSlot,
      };

      prisma.booking.findUnique.mockResolvedValue(mockBooking as any);
      prisma.$transaction.mockResolvedValue([
        { ...mockBooking, status: BookingStatus.CONFIRMED },
        { ...mockSlot, status: SlotStatus.BOOKED },
      ]);

      const result = await service.confirmBooking(101);

      expect(result.booking.status).toBe(BookingStatus.CONFIRMED);
      expect(realtimeGateway.broadcastSlotBooked).toHaveBeenCalled();
    });
  });
});
