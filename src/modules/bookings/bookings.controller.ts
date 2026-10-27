import {
  Controller,
  Get,
  Post,
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
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { BookingQueryDto } from './dto/booking-query.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { Idempotent } from '../../common/decorators/idempotent.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(Role.PLAYER, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: 'Hold a slot and create a pending booking (Idempotent)',
    description:
      'Atomically locks the slot for 5 minutes, locks pricing, and creates a PENDING booking. Requires an Idempotency-Key UUID header to guarantee at-most-once execution under retries.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description:
      'Client-generated UUID v4 (e.g. 123e4567-e89b-12d3-a456-426614174000) ensuring network retries and double clicks do not create duplicate bookings.',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'Booking successfully created in PENDING status. Proceed to checkout.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Slot is already booked, or held by another player, or request in progress.',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Idempotency key reused with a different request payload.',
  })
  create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.bookingsService.createBooking(userId, dto, idempotencyKey);
  }

  @Get('me')
  @Roles(Role.PLAYER, Role.ADMIN)
  @ApiOperation({
    summary: 'Get player bookings history',
    description:
      'Returns paginated bookings for the authenticated user, ordered newest first.',
  })
  findMyBookings(
    @CurrentUser('sub') userId: number,
    @Query() query: BookingQueryDto,
  ) {
    return this.bookingsService.findMyBookings(userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single booking by ID',
    description:
      'Returns booking details with court, venue, and slot. Accessible by player owner, venue host owner, or Admin.',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.bookingsService.findOne(id, userId, role);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking before cutoff',
    description:
      'Cancels the booking, releases the court slot back to AVAILABLE, and broadcasts a live WebSocket event. Fails if the venue cancellation cutoff has passed.',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelBooking(id, userId, role, dto);
  }

  @Post(':id/confirm-dev')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mock confirm booking (Dev testing)',
    description:
      'Simulates successful payment confirmation: marks booking CONFIRMED and slot BOOKED, and emits slot:booked over WebSockets. Restricted to ADMIN.',
  })
  confirmDev(@Param('id', ParseIntPipe) id: number) {
    return this.bookingsService.confirmBooking(id);
  }
}
