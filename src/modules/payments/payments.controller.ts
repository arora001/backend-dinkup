import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Req,
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
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto.js';
import { SimulateWebhookDto } from './dto/simulate-webhook.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { Idempotent } from '../../common/decorators/idempotent.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLAYER, Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent({ required: true })
  @ApiOperation({
    summary: 'Create a gateway payment order (Idempotent)',
    description:
      'Creates a payment order with the gateway (Mock or Razorpay) for a held booking. Enforces client-generated Idempotency-Key UUID header to prevent double orders.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Client-generated UUID v4 guaranteeing at-most-once execution',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment order created. Returns gateway order ID for checkout.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Booking already confirmed, or slot is no longer held.',
  })
  createOrder(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreatePaymentOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.createOrder(userId, dto, idempotencyKey);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payment gateway webhook (Source of truth)',
    description:
      'Receives signed webhook callbacks from payment gateway (Razorpay or Mock). Verifies HMAC signature, deduplicates event ID, captures payment, confirms booking, or automatically refunds late payments if the slot was retaken.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Webhook received and processed (or duplicate delivery safely ignored).',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing cryptographic HMAC signature.',
  })
  handleWebhook(
    @Req() req: RawBodyRequest,
    @Headers('x-razorpay-signature') razorpaySignature?: string,
    @Headers('x-mock-signature') mockSignature?: string,
  ) {
    const signature = razorpaySignature || mockSignature || '';
    const rawBody = req.rawBody || JSON.stringify(req.body);

    return this.paymentsService.handleWebhook(rawBody, signature);
  }

  @Post('simulate-webhook')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLAYER, Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simulate webhook confirmation (Dev testing)',
    description:
      'Generates a cryptographically signed mock webhook event and processes it. Confirms pending booking, sets slot BOOKED, or triggers automatic simulated refund if the slot hold expired and was taken by someone else.',
  })
  simulateWebhook(@Body() dto: SimulateWebhookDto) {
    return this.paymentsService.simulateWebhook(dto);
  }

  @Get('booking/:bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get payment details for a booking',
    description:
      'Fetches payment record(s) and status for a specific booking. Accessible by booking owner, venue host owner, or Admin.',
  })
  getPayment(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.paymentsService.getPaymentForBooking(bookingId, userId, role);
  }
}
