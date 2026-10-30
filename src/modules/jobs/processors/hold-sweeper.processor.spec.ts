import { HoldSweeperProcessor } from './hold-sweeper.processor.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { RealtimeGateway } from '../../realtime/realtime.gateway.js';
import type { Job } from 'bullmq';

describe('HoldSweeperProcessor', () => {
  let processor: HoldSweeperProcessor;
  let mockPrisma: any;
  let mockRealtime: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };

    mockRealtime = {
      broadcastSlotReleased: jest.fn(),
      broadcastSeatReleased: jest.fn(),
    };

    processor = new HoldSweeperProcessor(
      mockPrisma as unknown as PrismaService,
      mockRealtime as unknown as RealtimeGateway,
    );
  });

  it('should sweep expired slot holds and game seat holds, broadcasting releases', async () => {
    // 1st $queryRaw: sweeps slots
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { id: 10, court_id: 1, date: new Date('2026-10-30') },
      ])
      // 2nd $queryRaw: sweeps game seats
      .mockResolvedValueOnce([
        { id: 101, game_id: 50, seat_number: 2 },
      ])
      // 3rd $queryRaw: updates tbl_game
      .mockResolvedValueOnce([
        { id: 50, seats_taken: 1, seats_total: 4, status: 'OPEN' },
      ]);

    mockPrisma.$executeRaw.mockResolvedValueOnce(1);

    const result = await processor.process({ id: 'job-1' } as Job);

    expect(result).toEqual({ sweptSlotsCount: 1, sweptSeatsCount: 1 });
    expect(mockRealtime.broadcastSlotReleased).toHaveBeenCalledWith({
      slotId: 10,
      courtId: 1,
      date: '2026-10-30',
    });
    expect(mockRealtime.broadcastSeatReleased).toHaveBeenCalledWith({
      gameId: 50,
      seatNumber: 2,
      seatsTaken: 1,
      seatsTotal: 4,
      status: 'OPEN',
    });
  });

  it('should return 0 counts when no slots or seats have expired holds', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([]) // No expired slots
      .mockResolvedValueOnce([]); // No expired seats

    const result = await processor.process({ id: 'job-2' } as Job);

    expect(result).toEqual({ sweptSlotsCount: 0, sweptSeatsCount: 0 });
    expect(mockRealtime.broadcastSlotReleased).not.toHaveBeenCalled();
    expect(mockRealtime.broadcastSeatReleased).not.toHaveBeenCalled();
  });
});
