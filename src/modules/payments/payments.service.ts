import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import {
  PAYMENT_GATEWAY,
} from './gateways/payment-gateway.provider.js';
import type {
  PaymentGateway,
} from './gateways/payment-gateway.interface.js';
import { MockPaymentGateway } from './gateways/mock-payment.gateway.js';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto.js';
import { SimulateWebhookDto } from './dto/simulate-webhook.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { SlotStatus } from '../../common/enums/slot-status.enum.js';
import {
  BookingStatus,
  PaymentStatus,
} from '../../generated/prisma/enums.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * 1. Create Gateway Payment Order (Idempotent)
   */
  async createOrder(
    userId: number,
    dto: CreatePaymentOrderDto,
    idempotencyKey?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        slot: true,
        court: { include: { venue: true } },
        payments: {
          where: {
            status: {
              in: [PaymentStatus.CREATED, PaymentStatus.CAPTURED],
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID #${dto.bookingId} not found`);
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to pay for this booking',
      );
    }

    if (booking.status === BookingStatus.CONFIRMED) {
      throw new ConflictException('This booking has already been paid and confirmed');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay for a cancelled booking');
    }

    if (booking.status === BookingStatus.EXPIRED) {
      throw new BadRequestException('This booking has expired. Please select a new slot.');
    }

    // Idempotent re-use: if an active order was already created for this booking, return it
    const existingPayment = booking.payments[0];
    if (existingPayment && existingPayment.status === PaymentStatus.CREATED) {
      return {
        message: 'Existing payment order retrieved',
        payment: existingPayment,
        orderId: existingPayment.orderId,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        provider: existingPayment.provider,
      };
    }

    // Verify slot hold: must be held by this user, or still available
    const slot = booking.slot;
    if (slot.status === SlotStatus.BOOKED) {
      throw new ConflictException('This court slot has already been booked');
    }

    if (
      slot.status === SlotStatus.HELD &&
      slot.heldBy !== userId &&
      slot.holdExpiresAt &&
      slot.holdExpiresAt > new Date()
    ) {
      throw new ConflictException(
        'This slot is currently being held by another player',
      );
    }

    // Create order with gateway
    const gatewayOrder = await this.gateway.createOrder({
      bookingId: booking.id,
      amount: booking.totalPrice,
      currency: 'INR',
      receipt: booking.bookingReference,
      notes: {
        bookingReference: booking.bookingReference,
        venueName: booking.court.venue.name,
        courtName: booking.court.name,
      },
    });

    const paymentReference = this.generatePaymentReference();

    const payment = await this.prisma.payment.create({
      data: {
        paymentReference,
        bookingId: booking.id,
        userId,
        provider: this.gateway.getProviderName(),
        orderId: gatewayOrder.id,
        amount: booking.totalPrice,
        currency: gatewayOrder.currency,
        status: PaymentStatus.CREATED,
        idempotencyKey,
      },
      include: {
        booking: true,
      },
    });

    return {
      message: 'Payment order created successfully',
      payment,
      orderId: gatewayOrder.id,
      amount: booking.totalPrice,
      currency: gatewayOrder.currency,
      provider: this.gateway.getProviderName(),
    };
  }

  /**
   * 2. Webhook Processor (The Webhook is the Source of Truth)
   * - Verifies HMAC signature against raw body bytes
   * - Deduplicates via tbl_webhook_event (ON CONFLICT DO NOTHING)
   * - Atomic row transition (HELD -> BOOKED)
   * - Handles late-payment refund edge case if slot was taken
   */
  async handleWebhook(rawBody: string | Buffer, signature: string) {
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature header');
    }

    const isValid = this.gateway.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn('Webhook rejected: Invalid HMAC signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const bodyString = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : String(rawBody);

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(bodyString);
    } catch {
      throw new BadRequestException('Malformed webhook JSON payload');
    }

    const eventId =
      payload.id ||
      payload.event_id ||
      payload.payload?.payment?.entity?.id ||
      `evt_${randomBytes(8).toString('hex')}`;

    const eventType = payload.event || payload.event_type || 'payment.captured';
    const provider = this.gateway.getProviderName();

    // Deduplicate event: insert into tbl_webhook_event
    const insertResult = await this.prisma.$executeRaw`
      INSERT INTO tbl_webhook_event (event_id, provider, event_type, payload, processed_at, created_at)
      VALUES (
        ${eventId},
        ${provider}::"PaymentProvider",
        ${eventType},
        ${JSON.stringify(payload)}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (event_id) DO NOTHING;
    `;

    if (insertResult === 0) {
      this.logger.log(`Duplicate webhook event ${eventId} received — ignored.`);
      return {
        status: 'ignored',
        message: 'Webhook event already processed (duplicate delivery ignored)',
        eventId,
      };
    }

    // Process only payment success events
    if (eventType !== 'payment.captured' && eventType !== 'order.paid') {
      this.logger.log(`Ignoring non-payment webhook event: ${eventType}`);
      return {
        status: 'ignored',
        message: `Event type ${eventType} ignored`,
        eventId,
      };
    }

    const paymentEntity = payload.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id || payload.order_id;
    const paymentId = paymentEntity?.id || payload.payment_id || `pay_${randomBytes(6).toString('hex')}`;

    if (!orderId) {
      this.logger.warn(`Webhook payload missing order_id (event #${eventId})`);
      return { status: 'warning', message: 'Missing order_id in webhook payload' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      include: {
        booking: {
          include: {
            slot: true,
            court: true,
          },
        },
      },
    });

    if (!payment) {
      this.logger.error(`No payment record found for order ${orderId}`);
      return { status: 'error', message: `Payment record not found for order ${orderId}` };
    }

    if (payment.status === PaymentStatus.CAPTURED) {
      return {
        status: 'success',
        message: 'Payment already captured',
        paymentId: payment.paymentId,
      };
    }

    const slotId = payment.booking.slotId;
    const userId = payment.userId;

    // Atomic conditional write:
    // Move slot HELD -> BOOKED if slot still belongs to that player OR is currently AVAILABLE
    const slotUpdate = await this.prisma.$queryRaw<
      Array<{
        id: number;
        court_id: number;
        date: Date;
      }>
    >`
      UPDATE tbl_slot
      SET status = 'BOOKED'::"SlotStatus",
          held_by = NULL,
          hold_expires_at = NULL,
          version = version + 1,
          updated_at = NOW()
      WHERE id = ${slotId}
        AND (
          held_by = ${userId}
          OR status = 'AVAILABLE'::"SlotStatus"
        )
      RETURNING id, court_id, date;
    `;

    // Normal case: Player won the row (or hold expired but nobody else took it)
    if (slotUpdate.length > 0) {
      const bookedSlot = slotUpdate[0];

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.CAPTURED,
            paymentId,
            signature,
          },
        }),
        this.prisma.booking.update({
          where: { id: payment.bookingId },
          data: {
            status: BookingStatus.CONFIRMED,
          },
        }),
      ]);

      const dateStr =
        bookedSlot.date instanceof Date
          ? bookedSlot.date.toISOString().split('T')[0]
          : String(bookedSlot.date);

      // Live WebSocket broadcast: slot is permanently booked
      this.realtimeGateway.broadcastSlotBooked({
        slotId: bookedSlot.id,
        courtId: bookedSlot.court_id,
        date: dateStr,
      });

      this.logger.log(
        `✓ Payment captured and booking #${payment.bookingId} confirmed (Slot #${slotId})`,
      );

      return {
        status: 'confirmed',
        message: 'Payment captured and booking confirmed successfully',
        bookingId: payment.bookingId,
        paymentId,
      };
    }

    // Late-payment edge case:
    // Payment arrived after hold expired AND another player has taken the slot!
    this.logger.warn(
      `[LATE PAYMENT EDGE CASE] Slot #${slotId} was re-taken by another player. Initiating automatic refund for booking #${payment.bookingId}.`,
    );

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REFUND_PENDING,
        paymentId,
      },
    });

    const refundReason =
      'Slot hold expired and court was booked by another player';

    const refund = await this.gateway.refund({
      paymentId,
      amount: payment.amount,
      reason: refundReason,
    });

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          refundId: refund.id,
          refundReason,
        },
      }),
      this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: BookingStatus.EXPIRED,
          cancelReason: refundReason,
        },
      }),
    ]);

    this.logger.log(
      `✓ Automatic refund issued (${refund.id}) for late booking #${payment.bookingId}`,
    );

    return {
      status: 'refunded',
      message:
        'Slot hold expired and court was re-taken by another player. An automatic refund was issued.',
      bookingId: payment.bookingId,
      refundId: refund.id,
    };
  }

  /**
   * 3. Dev Testing Helper: Simulate Webhook Delivery
   */
  async simulateWebhook(dto: SimulateWebhookDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        user: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking #${dto.bookingId} not found`);
    }

    let payment = booking.payments[0];
    if (!payment) {
      // Auto-create order if missing for convenience in dev
      const orderRes = await this.createOrder(booking.userId, {
        bookingId: booking.id,
      });
      payment = orderRes.payment as any;
    }

    // Use Mock Gateway helper to generate valid signed payload
    let mockGw: MockPaymentGateway;
    if (this.gateway instanceof MockPaymentGateway) {
      mockGw = this.gateway;
    } else {
      mockGw = new MockPaymentGateway(new (class {
        get() {
          return 'mock_whsec_dinkup_dev_secret_key';
        }
      } as any)());
    }

    const { rawBody, signature } = mockGw.generateMockWebhookPayload({
      eventType: dto.eventType || 'payment.captured',
      orderId: payment.orderId,
      amount: payment.amount,
      email: booking.user.email,
      contact: booking.user.phone || undefined,
    });

    return this.handleWebhook(rawBody, signature);
  }

  /**
   * 4. Query Payment for Booking
   */
  async getPaymentForBooking(
    bookingId: number,
    userId: number,
    role: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        venue: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking #${bookingId} not found`);
    }

    if (
      role !== Role.ADMIN &&
      booking.userId !== userId &&
      booking.venue.hostId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view payments for this booking',
      );
    }

    return booking.payments;
  }

  private generatePaymentReference(): string {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomHex = randomBytes(2).toString('hex').toUpperCase();

    return `PAY-${yy}${mm}${dd}-${randomHex}`;
  }
}
