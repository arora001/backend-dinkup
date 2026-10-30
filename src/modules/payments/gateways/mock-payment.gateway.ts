import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  PaymentGateway,
  CreateOrderParams,
  GatewayOrder,
  RefundParams,
  GatewayRefund,
} from './payment-gateway.interface.js';
import { PaymentProvider } from '../../../generated/prisma/enums.js';

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.webhookSecret =
      this.config.get<string>('PAYMENT_MOCK_WEBHOOK_SECRET') ||
      'mock_whsec_dinkup_dev_secret_key';
    this.logger.log('MockPaymentGateway initialized (Offline, Zero-Setup mode)');
  }

  getProviderName(): PaymentProvider {
    return PaymentProvider.MOCK;
  }

  async createOrder(params: CreateOrderParams): Promise<GatewayOrder> {
    const orderId = `order_mock_${randomBytes(8).toString('hex')}`;

    this.logger.debug(
      `[MOCK] Created mock order ${orderId} for booking #${params.bookingId} (₹${params.amount})`,
    );

    return {
      id: orderId,
      amount: params.amount,
      currency: params.currency || 'INR',
      status: 'created',
      provider: PaymentProvider.MOCK,
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature) {
      return false;
    }

    try {
      const bodyBuffer = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(rawBody, 'utf8');

      const expectedSignature = createHmac('sha256', this.webhookSecret)
        .update(bodyBuffer)
        .digest('hex');

      const sigBuffer = Buffer.from(signature.trim(), 'utf8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (err) {
      this.logger.error(`Error verifying mock webhook signature: ${err}`);
      return false;
    }
  }

  async refund(params: RefundParams): Promise<GatewayRefund> {
    const refundId = `rfnd_mock_${randomBytes(8).toString('hex')}`;

    this.logger.log(
      `[MOCK] Refund processed for payment ${params.paymentId} -> ${refundId} (Reason: ${params.reason || 'Not specified'})`,
    );

    return {
      id: refundId,
      amount: params.amount || 0,
      status: 'processed',
    };
  }

  /**
   * Helper utility for testing: generates a signed mock webhook payload
   */
  generateMockWebhookPayload(params: {
    eventType: string;
    orderId: string;
    paymentId?: string;
    amount: number;
    email?: string;
    contact?: string;
  }): { payload: any; signature: string; rawBody: string } {
    const paymentId =
      params.paymentId || `pay_mock_${randomBytes(8).toString('hex')}`;
    const eventId = `evt_mock_${randomBytes(8).toString('hex')}`;

    const payload = {
      entity: 'event',
      account_id: 'acc_mock_dinkup',
      event: params.eventType,
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: 'payment',
            amount: params.amount * 100, // in paise
            currency: 'INR',
            status: 'captured',
            order_id: params.orderId,
            method: 'upi',
            email: params.email || 'player@dinkup.in',
            contact: params.contact || '+919876543210',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
      id: eventId,
    };

    const rawBody = JSON.stringify(payload);
    const signature = createHmac('sha256', this.webhookSecret)
      .update(Buffer.from(rawBody, 'utf8'))
      .digest('hex');

    return { payload, signature, rawBody };
  }
}
