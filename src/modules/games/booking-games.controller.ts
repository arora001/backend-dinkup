import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GamesService } from './games.service.js';
import { CreateGameDto } from './dto/create-game.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Games')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bookings')
export class BookingGamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post(':id/game')
  @Roles(Role.PLAYER, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Open remaining seats of a booking as an open game',
    description:
      'Allows the booking owner to open unreserved seats to the public feed so other players can join and split costs.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'Open game successfully created and creator assigned to Seat #1.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Booking is not confirmed or already has an open game.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User is not the owner of this booking.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Booking not found.',
  })
  async createGame(
    @CurrentUser() user: { sub: number; email: string; role: Role },
    @Param('id', ParseIntPipe) bookingId: number,
    @Body() dto: CreateGameDto,
  ) {
    return this.gamesService.createGame(user.sub, bookingId, dto);
  }
}
