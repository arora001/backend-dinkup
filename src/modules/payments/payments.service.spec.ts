import {
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import {
  BookingStatus,
  PaymentStatus,
  PaymentProvider,
  SlotStatus,
} from '../../generated/prisma/enums.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;
  let gateway: any;
  let realtimeGateway: any;

  const mockDate = new Date('2026-10-30T10:00:00.000Z');

  const mockBooking = {
    id: 10,
    bookingReference: 'DNK-261030-ABCD',
    userId: 1,
    slotId: 42,
    courtId: 2,
    venueId: 5,
    status: BookingStatus.PENDING,
    totalPrice: 800,
    slot: {
      id: 42,
      courtId: 2,
      date: mockDate,
      startTime: '10:00',
      endTime: '11:00',
      price: 800,
      status: SlotStatus.HELD,
      heldBy: 1,
      holdExpiresAt: new Date(Date.now() + 300000),
    },
    court: {
      id: 2,
      name: 'Centre Court',
      venue: { id: 5, name: 'Tricity Club' },
    },
    payments: [],
  };

  beforeEach(() => {
    prisma = {
      booking: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    gateway = {
      getProviderName: jest.fn().mockReturnValue(PaymentProvider.MOCK),
      createOrder: jest.fn().mockResolvedValue({
        id: 'order_mock_test123',
        amount: 800,
        currency: 'INR',
        status: 'created',
        provider: PaymentProvider.MOCK,
      }),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      refund: jest.fn().mockResolvedValue({
        id: 'rfnd_mock_test123',
        amount: 800,
        status: 'processed',
      }),
    };

    realtimeGateway = {
      broadcastSlotBooked: jest.fn(),
      broadcastSlotReleased: jest.fn(),
    };

    service = new PaymentsService(prisma, gateway, realtimeGateway);
  });

  describe('createOrder', () => {
    it('creates a new payment order for a pending booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(mockBooking);
      prisma.payment.create.mockResolvedValue({
        id: 1,
        paymentReference: 'PAY-261030-XXXX',
        bookingId: 10,
        userId: 1,
        provider: PaymentProvider.MOCK,
        orderId: 'order_mock_test123',
        amount: 800,
        currency: 'INR',
        status: PaymentStatus.CREATED,
      });

      const result = await service.createOrder(1, { bookingId: 10 });

      expect(result.orderId).toBe('order_mock_test123');
      expect(result.amount).toBe(800);
      expect(result.provider).toBe(PaymentProvider.MOCK);
      expect(gateway.createOrder).toHaveBeenCalledWith({
        bookingId: 10,
        amount: 800,
        currency: 'INR',
        receipt: 'DNK-261030-ABCD',
        notes: expect.any(Object),
      });
    });

    it('rejects if booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.createOrder(1, { bookingId: 999 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects if booking is already confirmed', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CONFIRMED,
      });

      await expect(service.createOrder(1, { bookingId: 10 })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('handleWebhook', () => {
    const rawPayload = {
      id: 'evt_test_123',
      event: 'payment.captured',
      order_id: 'order_mock_test123',
      payment_id: 'pay_mock_test123',
    };
    const rawBody = JSON.stringify(rawPayload);
    const validSignature = 'valid_hmac_signature';

    it('throws UnauthorizedException if signature is invalid', async () => {
      gateway.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(rawBody, 'invalid_sig'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('ignores duplicate webhook delivery via tbl_webhook_event deduplication', async () => {
      // 0 rows inserted indicates duplicate primary key
      prisma.$executeRaw.mockResolvedValue(0);

      const result = await service.handleWebhook(rawBody, validSignature);

      expect(result.status).toBe('ignored');
      expect(result.message).toContain('duplicate');
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('normal case: confirms booking, captures payment, emits slot:booked', async () => {
      // Fresh event inserted (1 row)
      prisma.$executeRaw.mockResolvedValue(1);

      const mockPayment = {
        id: 1,
        bookingId: 10,
        userId: 1,
        orderId: 'order_mock_test123',
        amount: 800,
        status: PaymentStatus.CREATED,
        booking: {
          slotId: 42,
          courtId: 2,
        },
      };

      prisma.payment.findFirst.mockResolvedValue(mockPayment);
      // Atomic slot update returns 1 row (winner)
      prisma.$queryRaw.mockResolvedValue([
        { id: 42, court_id: 2, date: mockDate },
      ]);
      prisma.$transaction.mockResolvedValue([
        { ...mockPayment, status: PaymentStatus.CAPTURED },
        { ...mockBooking, status: BookingStatus.CONFIRMED },
      ]);

      const result = await service.handleWebhook(rawBody, validSignature);

      expect(result.status).toBe('confirmed');
      expect(realtimeGateway.broadcastSlotBooked).toHaveBeenCalledWith({
        slotId: 42,
        courtId: 2,
        date: expect.any(String),
      });
    });

    it('late-payment edge case: slot retaken by another player -> issues automatic refund', async () => {
      // Fresh event inserted
      prisma.$executeRaw.mockResolvedValue(1);

      const mockPayment = {
        id: 1,
        bookingId: 10,
        userId: 1,
        orderId: 'order_mock_test123',
        amount: 800,
        status: PaymentStatus.CREATED,
        booking: {
          slotId: 42,
          courtId: 2,
        },
      };

      prisma.payment.findFirst.mockResolvedValue(mockPayment);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.REFUND_PENDING,
      });

      // Atomic slot update returns 0 rows because slot was retaken!
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([
        { ...mockPayment, status: PaymentStatus.REFUNDED },
        { ...mockBooking, status: BookingStatus.EXPIRED },
      ]);

      const result = await service.handleWebhook(rawBody, validSignature);

      expect(result.status).toBe('refunded');
      expect(gateway.refund).toHaveBeenCalledWith({
        paymentId: 'pay_mock_test123',
        amount: 800,
        reason: expect.stringContaining('expired'),
      });
      expect(realtimeGateway.broadcastSlotBooked).not.toHaveBeenCalled();
    });
  });
});
