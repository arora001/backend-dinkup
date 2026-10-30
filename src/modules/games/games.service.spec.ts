import {
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { GamesService } from './games.service.js';
import {
  BookingStatus,
  SkillLevel,
  GameStatus,
  GameSeatStatus,
} from '../../generated/prisma/enums.js';
import { Role } from '../../common/enums/role.enum.js';

describe('GamesService', () => {
  let service: GamesService;
  let prisma: any;
  let realtimeGateway: any;

  const mockDate = new Date('2026-10-30T10:00:00.000Z');

  const mockBooking = {
    id: 10,
    bookingReference: 'DNK-261030-ABCD',
    userId: 1,
    slotId: 42,
    courtId: 2,
    venueId: 5,
    status: BookingStatus.CONFIRMED,
    totalPrice: 800,
    court: {
      id: 2,
      name: 'Centre Court',
      venue: { id: 5, name: 'Tricity Club' },
    },
    slot: {
      id: 42,
      date: mockDate,
      startTime: '10:00',
      endTime: '11:00',
    },
    game: null,
  };

  const mockGame = {
    id: 100,
    bookingId: 10,
    creatorId: 1,
    courtId: 2,
    venueId: 5,
    title: 'Intermediate Doubles',
    skillLevel: SkillLevel.INTERMEDIATE,
    seatsTotal: 4,
    seatsTaken: 1,
    pricePerSeat: 200,
    status: GameStatus.OPEN,
    version: 0,
    seats: [
      {
        id: 1,
        gameId: 100,
        userId: 1,
        seatNumber: 1,
        price: 200,
        status: GameSeatStatus.CONFIRMED,
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      booking: {
        findUnique: jest.fn(),
      },
      game: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      gameSeat: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((cb) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return Promise.all(cb);
      }),
    };

    realtimeGateway = {
      broadcastSeatClaimed: jest.fn(),
      broadcastSeatReleased: jest.fn(),
      broadcastGameFull: jest.fn(),
    };

    service = new GamesService(prisma, realtimeGateway);
  });

  describe('createGame', () => {
    it('creates game and confirms creator in seat #1', async () => {
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
      prisma.game.create.mockResolvedValue(mockGame);
      prisma.gameSeat.create.mockResolvedValue({
        id: 1,
        gameId: 100,
        userId: 1,
        seatNumber: 1,
        status: GameSeatStatus.CONFIRMED,
      });
      prisma.game.findUnique.mockResolvedValue(mockGame);

      const result = await service.createGame(1, 10, {
        title: 'Intermediate Doubles',
        skillLevel: SkillLevel.INTERMEDIATE,
        seatsTotal: 4,
      });

      expect(result.id).toBe(100);
      expect(result.seatsAvailable).toBe(3);
      expect(prisma.game.create).toHaveBeenCalled();
      expect(prisma.gameSeat.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            seatNumber: 1,
            status: GameSeatStatus.CONFIRMED,
          }),
        }),
      );
    });

    it('rejects if user is not the booking owner', async () => {
      prisma.booking.findUnique.mockResolvedValue(mockBooking);

      await expect(
        service.createGame(999, 10, { skillLevel: SkillLevel.OPEN }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects if an open game already exists for this booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...mockBooking,
        game: { id: 100 },
      });

      await expect(
        service.createGame(1, 10, { skillLevel: SkillLevel.OPEN }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('claimSeat', () => {
    it('claims a seat atomically with 5-minute hold and emits realtime event', async () => {
      prisma.gameSeat.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 100,
          seats_taken: 2,
          seats_total: 4,
          price_per_seat: 200,
          status: 'OPEN',
        },
      ]);
      prisma.gameSeat.findMany.mockResolvedValue([{ seatNumber: 1 }]);
      prisma.gameSeat.create.mockResolvedValue({
        id: 2,
        gameId: 100,
        userId: 2,
        seatNumber: 2,
        price: 200,
        status: GameSeatStatus.HELD,
        holdExpiresAt: new Date(Date.now() + 300000),
      });

      const result = await service.claimSeat(2, 100, {});

      expect(result.seat.seatNumber).toBe(2);
      expect(result.expiresInSeconds).toBe(300);
      expect(realtimeGateway.broadcastSeatClaimed).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 100,
          seatNumber: 2,
          userId: 2,
          seatsTaken: 2,
        }),
      );
    });

    it('emits broadcastGameFull when claiming the final seat', async () => {
      prisma.gameSeat.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 100,
          seats_taken: 4,
          seats_total: 4,
          price_per_seat: 200,
          status: 'FULL',
        },
      ]);
      prisma.gameSeat.findMany.mockResolvedValue([
        { seatNumber: 1 },
        { seatNumber: 2 },
        { seatNumber: 3 },
      ]);
      prisma.gameSeat.create.mockResolvedValue({
        id: 4,
        gameId: 100,
        userId: 4,
        seatNumber: 4,
        price: 200,
        status: GameSeatStatus.HELD,
      });

      await service.claimSeat(4, 100, {});

      expect(realtimeGateway.broadcastGameFull).toHaveBeenCalledWith({
        gameId: 100,
      });
    });

    it('rejects if player already has an active seat in the game', async () => {
      prisma.gameSeat.findFirst.mockResolvedValue({
        id: 1,
        userId: 2,
        status: GameSeatStatus.CONFIRMED,
      });

      await expect(service.claimSeat(2, 100, {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects when game is already full (0 rows updated)', async () => {
      prisma.gameSeat.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.game.findUnique.mockResolvedValue({
        ...mockGame,
        status: GameStatus.FULL,
        seatsTaken: 4,
      });

      await expect(service.claimSeat(5, 100, {})).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('leaveSeat', () => {
    it('allows a joining player to release their seat and restores game capacity', async () => {
      const mockJoiningSeat = {
        id: 3,
        gameId: 100,
        userId: 3,
        seatNumber: 3,
        status: GameSeatStatus.CONFIRMED,
      };
      prisma.gameSeat.findFirst.mockResolvedValue(mockJoiningSeat);
      prisma.gameSeat.update.mockResolvedValue({
        ...mockJoiningSeat,
        status: GameSeatStatus.RELEASED,
      });
      prisma.game.update.mockResolvedValue({
        ...mockGame,
        seatsTaken: 1,
        status: GameStatus.OPEN,
      });

      const result = await service.leaveSeat(3, 100);

      expect(result.message).toContain('released');
      expect(realtimeGateway.broadcastSeatReleased).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 100,
          seatNumber: 3,
          seatsTaken: 1,
        }),
      );
    });

    it('prevents creator from leaving seat #1', async () => {
      prisma.gameSeat.findFirst.mockResolvedValue({
        id: 1,
        gameId: 100,
        userId: 1,
        seatNumber: 1,
        status: GameSeatStatus.CONFIRMED,
      });

      await expect(service.leaveSeat(1, 100)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancelGame', () => {
    it('cancels game and releases joining seats', async () => {
      prisma.game.findUnique.mockResolvedValue({
        ...mockGame,
        seats: [
          { id: 1, seatNumber: 1 },
          { id: 2, seatNumber: 2 },
        ],
      });
      prisma.game.update.mockResolvedValue({
        ...mockGame,
        status: GameStatus.CANCELLED,
      });
      prisma.gameSeat.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancelGame(1, 100, Role.PLAYER);

      expect(result.message).toContain('cancelled');
    });

    it('rejects cancellation by non-creator', async () => {
      prisma.game.findUnique.mockResolvedValue(mockGame);

      await expect(
        service.cancelGame(999, 100, Role.PLAYER),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
