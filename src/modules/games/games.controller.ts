import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { GamesService } from './games.service.js';
import { CreateGameDto } from './dto/create-game.dto.js';
import { ClaimSeatDto } from './dto/claim-seat.dto.js';
import { GameQueryDto } from './dto/game-query.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { Idempotent } from '../../common/decorators/idempotent.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Games')
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  @ApiOperation({
    summary: 'Public feed of open games',
    description:
      'Returns a paginated list of active open games with remaining seat availability, venue, court, schedule, and creator details.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of open games matching search filters.',
  })
  async findOpenGames(@Query() query: GameQueryDto) {
    return this.gamesService.findOpenGames(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get details of an open game and player roster',
    description:
      'Returns complete metadata of a game, including confirmed players and held seats.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Game details found.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Game not found.',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.gamesService.findOne(id);
  }

  @Post(':id/seats')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLAYER, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent({ required: false })
  @ApiOperation({
    summary: 'Claim a seat in an open game (Idempotent, atomic)',
    description:
      'Reserves an available seat for 5 minutes using atomic SQL row locking to prevent overfilling. Optionally accepts an Idempotency-Key header to avoid duplicate claims.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description:
      'Client UUID v4 guaranteeing at-most-once seat claim execution under network retries.',
    required: false,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Seat reserved for 5 minutes. Proceed to payment.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Game is already full, cancelled, or user already holds a seat.',
  })
  async claimSeat(
    @CurrentUser() user: { sub: number; email: string; role: Role },
    @Param('id', ParseIntPipe) gameId: number,
    @Body() dto: ClaimSeatDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.gamesService.claimSeat(user.sub, gameId, dto, idempotencyKey);
  }

  @Post(':id/leave')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLAYER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Leave / release a reserved seat',
    description:
      'Allows a joining player to release their held or confirmed seat before the game. Automatically re-opens the game and notifies real-time listeners.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Seat released successfully.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Creator cannot leave seat 1 (cancel the game instead).',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Active seat not found for this user.',
  })
  async leaveSeat(
    @CurrentUser() user: { sub: number; email: string; role: Role },
    @Param('id', ParseIntPipe) gameId: number,
  ) {
    return this.gamesService.leaveSeat(user.sub, gameId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLAYER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an open game',
    description:
      'Cancels the game, releasing all joined players. Only the game creator or an admin can cancel.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Game cancelled successfully.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only the creator or an admin can cancel this game.',
  })
  async cancelGame(
    @CurrentUser() user: { sub: number; email: string; role: Role },
    @Param('id', ParseIntPipe) gameId: number,
  ) {
    return this.gamesService.cancelGame(user.sub, gameId, user.role);
  }

  @Post('booking/:bookingId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLAYER, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Open remaining seats of a booking as an open game (Alias)',
    description:
      'Convenience alias endpoint for POST /api/v1/bookings/:id/game.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Open game created.',
  })
  async createGameAlias(
    @CurrentUser() user: { sub: number; email: string; role: Role },
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: CreateGameDto,
  ) {
    return this.gamesService.createGame(user.sub, bookingId, dto);
  }
}
