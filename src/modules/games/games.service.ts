import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { CreateGameDto } from './dto/create-game.dto.js';
import { ClaimSeatDto } from './dto/claim-seat.dto.js';
import { GameQueryDto } from './dto/game-query.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  BookingStatus,
  SkillLevel,
  GameStatus,
  GameSeatStatus,
} from '../../generated/prisma/enums.js';

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * 1. Create Open Game from an existing Booking
   * - Creator is automatically confirmed in Seat #1
   * - Remaining seats (e.g. 2, 3, 4) are opened to the public
   */
  async createGame(userId: number, bookingId: number, dto: CreateGameDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        slot: true,
        court: { include: { venue: true } },
        game: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID #${bookingId} not found`);
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to open a game for this booking',
      );
    }

    if (
      booking.status !== BookingStatus.CONFIRMED &&
      booking.status !== BookingStatus.PENDING
    ) {
      throw new BadRequestException(
        `Cannot open a game for a booking with status ${booking.status}`,
      );
    }

    if (booking.game) {
      throw new ConflictException(
        'An open game has already been created for this booking',
      );
    }

    const seatsTotal = dto.seatsTotal ?? 4;
    const pricePerSeat =
      dto.pricePerSeat ?? Math.ceil(booking.totalPrice / seatsTotal);

    const title =
      dto.title ||
      `${booking.court.venue.name} Open ${dto.skillLevel || SkillLevel.OPEN} Game`;

    const [game] = await this.prisma.$transaction(async (tx) => {
      const createdGame = await tx.game.create({
        data: {
          bookingId: booking.id,
          creatorId: userId,
          courtId: booking.courtId,
          venueId: booking.venueId,
          title,
          description: dto.description,
          skillLevel: dto.skillLevel || SkillLevel.OPEN,
          seatsTotal,
          seatsTaken: 1, // Creator occupies Seat 1
          pricePerSeat,
          status: GameStatus.OPEN,
        },
      });

      // Creator occupies Seat #1 in CONFIRMED status
      await tx.gameSeat.create({
        data: {
          gameId: createdGame.id,
          userId,
          seatNumber: 1,
          price: pricePerSeat,
          status: GameSeatStatus.CONFIRMED,
        },
      });

      return [createdGame];
    });

    this.logger.log(
      `Open game #${game.id} created for booking #${booking.id} (${game.seatsTaken}/${game.seatsTotal} seats taken)`,
    );

    return this.findOne(game.id);
  }

  /**
   * 2. Public Open Games Feed
   */
  async findOpenGames(query: GameQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {
      status: query.status ?? GameStatus.OPEN,
      ...(query.skillLevel ? { skillLevel: query.skillLevel } : {}),
      ...(query.city || query.area
        ? {
            venue: {
              ...(query.city ? { city: query.city } : {}),
              ...(query.area
                ? { area: { contains: query.area, mode: 'insensitive' } }
                : {}),
            },
          }
        : {}),
      ...(query.date
        ? {
            booking: {
              slot: {
                date: new Date(query.date),
              },
            },
          }
        : {}),
    };

    const [total, games] = await Promise.all([
      this.prisma.game.count({ where }),
      this.prisma.game.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: { id: true, name: true, role: true },
          },
          court: {
            select: { id: true, name: true, surface: true, type: true },
          },
          venue: {
            select: {
              id: true,
              name: true,
              slug: true,
              city: true,
              area: true,
              address: true,
              images: { where: { isCover: true }, take: 1 },
            },
          },
          booking: {
            select: {
              id: true,
              slot: {
                select: {
                  id: true,
                  date: true,
                  startTime: true,
                  endTime: true,
                  price: true,
                },
              },
            },
          },
          seats: {
            where: {
              status: { in: [GameSeatStatus.HELD, GameSeatStatus.CONFIRMED] },
            },
            include: {
              user: { select: { id: true, name: true } },
            },
            orderBy: { seatNumber: 'asc' },
          },
        },
      }),
    ]);

    const formatted = games.map((g) => ({
      ...g,
      seatsAvailable: Math.max(0, g.seatsTotal - g.seatsTaken),
    }));

    return {
      data: formatted,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 3. Fetch Single Game Details
   */
  async findOne(gameId: number) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        court: {
          select: {
            id: true,
            name: true,
            surface: true,
            type: true,
            basePricePerHour: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            area: true,
            address: true,
            googleMapsUrl: true,
            contactPhone: true,
            whatsappNumber: true,
            images: { where: { isCover: true }, take: 1 },
          },
        },
        booking: {
          select: {
            id: true,
            bookingReference: true,
            status: true,
            slot: {
              select: {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
              },
            },
          },
        },
        seats: {
          where: {
            status: { in: [GameSeatStatus.HELD, GameSeatStatus.CONFIRMED] },
          },
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { seatNumber: 'asc' },
        },
      },
    });

    if (!game) {
      throw new NotFoundException(`Open game with ID #${gameId} not found`);
    }

    return {
      ...game,
      seatsAvailable: Math.max(0, game.seatsTotal - game.seatsTaken),
    };
  }

  /**
   * 4. Claim a Seat (Zero Overfilling Atomic Guarantees)
   * Single atomic conditional UPDATE:
   * UPDATE tbl_game SET seats_taken = seats_taken + 1 WHERE id = $gameId AND status = 'OPEN' AND seats_taken < seats_total
   */
  async claimSeat(
    userId: number,
    gameId: number,
    _dto: ClaimSeatDto,
    _idempotencyKey?: string,
  ) {
    // 1. Verify player doesn't already have an active seat in this game
    const existingSeat = await this.prisma.gameSeat.findFirst({
      where: {
        gameId,
        userId,
        status: { in: [GameSeatStatus.HELD, GameSeatStatus.CONFIRMED] },
      },
    });

    if (existingSeat) {
      if (
        existingSeat.status === GameSeatStatus.HELD &&
        existingSeat.holdExpiresAt &&
        existingSeat.holdExpiresAt > new Date()
      ) {
        const expiresInSeconds = Math.max(
          0,
          Math.floor((existingSeat.holdExpiresAt.getTime() - Date.now()) / 1000),
        );
        return {
          message: 'You already hold a seat in this game',
          seat: existingSeat,
          expiresInSeconds,
        };
      }
      throw new ConflictException('You already hold a confirmed seat in this game');
    }

    // 2. Single atomic conditional row update
    const updated = await this.prisma.$queryRaw<
      Array<{
        id: number;
        seats_taken: number;
        seats_total: number;
        price_per_seat: number;
        status: string;
      }>
    >`
      UPDATE tbl_game
      SET seats_taken = seats_taken + 1,
          status = CASE 
            WHEN seats_taken + 1 >= seats_total THEN 'FULL'::"GameStatus" 
            ELSE status 
          END,
          version = version + 1,
          updated_at = NOW()
      WHERE id = ${gameId}
        AND status = 'OPEN'::"GameStatus"
        AND seats_taken < seats_total
      RETURNING id, seats_taken, seats_total, price_per_seat, status;
    `;

    if (updated.length === 0) {
      const gameCheck = await this.prisma.game.findUnique({
        where: { id: gameId },
      });

      if (!gameCheck) {
        throw new NotFoundException(`Open game #${gameId} not found`);
      }

      if (gameCheck.status === GameStatus.FULL || gameCheck.seatsTaken >= gameCheck.seatsTotal) {
        throw new ConflictException('This open game is already full');
      }

      if (gameCheck.status === GameStatus.CANCELLED) {
        throw new ConflictException('This open game has been cancelled');
      }

      throw new ConflictException('Unable to claim seat. Please retry.');
    }

    const gameRow = updated[0];

    // 3. Find next available seatNumber (from 2 up to seatsTotal)
    const activeSeats = await this.prisma.gameSeat.findMany({
      where: {
        gameId,
        status: { in: [GameSeatStatus.HELD, GameSeatStatus.CONFIRMED] },
      },
      select: { seatNumber: true },
    });

    const takenSet = new Set(activeSeats.map((s) => s.seatNumber));
    let seatNumber = 2;
    for (let i = 2; i <= gameRow.seats_total; i++) {
      if (!takenSet.has(i)) {
        seatNumber = i;
        break;
      }
    }

    const holdExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute hold

    const seat = await this.prisma.gameSeat.create({
      data: {
        gameId,
        userId,
        seatNumber,
        price: gameRow.price_per_seat,
        status: GameSeatStatus.HELD,
        holdExpiresAt,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // 4. Live WebSocket Broadcast
    this.realtimeGateway.broadcastSeatClaimed({
      gameId,
      seatNumber,
      userId,
      seatsTaken: gameRow.seats_taken,
      seatsTotal: gameRow.seats_total,
      status: gameRow.status,
    });

    if (gameRow.status === GameStatus.FULL) {
      this.realtimeGateway.broadcastGameFull({ gameId });
    }

    const expiresInSeconds = 300;

    return {
      message: 'Seat successfully reserved for 5 minutes. Please proceed to payment.',
      seat,
      expiresInSeconds,
    };
  }

  /**
   * 5. Confirm Seat (invoked upon payment capture)
   */
  async confirmSeat(gameId: number, seatId: number) {
    const seat = await this.prisma.gameSeat.findUnique({
      where: { id: seatId },
      include: { game: true },
    });

    if (!seat || seat.gameId !== gameId) {
      throw new NotFoundException(`Seat #${seatId} not found for game #${gameId}`);
    }

    if (seat.status === GameSeatStatus.CONFIRMED) {
      return { message: 'Seat is already confirmed', seat };
    }

    const confirmed = await this.prisma.gameSeat.update({
      where: { id: seatId },
      data: {
        status: GameSeatStatus.CONFIRMED,
        holdExpiresAt: null,
      },
    });

    return {
      message: 'Seat confirmed successfully',
      seat: confirmed,
    };
  }

  /**
   * 6. Leave / Release a Seat
   */
  async leaveSeat(userId: number, gameId: number) {
    const seat = await this.prisma.gameSeat.findFirst({
      where: {
        gameId,
        userId,
        status: { in: [GameSeatStatus.HELD, GameSeatStatus.CONFIRMED] },
      },
    });

    if (!seat) {
      throw new NotFoundException('You do not hold an active seat in this game');
    }

    if (seat.seatNumber === 1) {
      throw new BadRequestException(
        'The game creator cannot leave their seat. Cancel the game instead.',
      );
    }

    const [updatedGame] = await this.prisma.$transaction(async (tx) => {
      await tx.gameSeat.update({
        where: { id: seat.id },
        data: {
          status: GameSeatStatus.RELEASED,
        },
      });

      const g = await tx.game.update({
        where: { id: gameId },
        data: {
          seatsTaken: { decrement: 1 },
          status: GameStatus.OPEN, // Re-open game if it was full
        },
      });

      return [g];
    });

    this.realtimeGateway.broadcastSeatReleased({
      gameId,
      seatNumber: seat.seatNumber,
      seatsTaken: updatedGame.seatsTaken,
      seatsTotal: updatedGame.seatsTotal,
      status: updatedGame.status,
    });

    return {
      message: 'Seat released successfully',
      seatId: seat.id,
      seatsAvailable: updatedGame.seatsTotal - updatedGame.seatsTaken,
    };
  }

  /**
   * 7. Cancel Game (Creator or Admin)
   */
  async cancelGame(userId: number, gameId: number, role: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        seats: {
          where: {
            status: { in: [GameSeatStatus.HELD, GameSeatStatus.CONFIRMED] },
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException(`Open game #${gameId} not found`);
    }

    if (role !== Role.ADMIN && game.creatorId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to cancel this open game',
      );
    }

    if (game.status === GameStatus.CANCELLED) {
      throw new BadRequestException('This game is already cancelled');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { id: gameId },
        data: {
          status: GameStatus.CANCELLED,
        },
      });

      // Release all non-creator joining seats
      await tx.gameSeat.updateMany({
        where: {
          gameId,
          seatNumber: { not: 1 },
          status: { in: [GameSeatStatus.HELD, GameSeatStatus.CONFIRMED] },
        },
        data: {
          status: GameSeatStatus.RELEASED,
        },
      });
    });

    this.logger.log(`Open game #${gameId} was cancelled by user #${userId}`);

    return {
      message: 'Open game cancelled successfully',
      gameId,
    };
  }
}
