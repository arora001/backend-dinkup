import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentGateway,
  CreateOrderParams,
  GatewayOrder,
  RefundParams,
  GatewayRefund,
} from './payment-gateway.interface.js';
import { PaymentProvider } from '../../../generated/prisma/enums.js';

@Injectable()
export class RazorpayPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(RazorpayPaymentGateway.name);
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  constructor(private readonly config: ConfigService) {
    this.keyId = this.config.get<string>('RAZORPAY_KEY_ID') || '';
    this.keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') || '';
    this.webhookSecret =
      this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') || '';

    if (this.keyId && this.keySecret) {
      this.logger.log('RazorpayPaymentGateway initialized with API credentials');
    } else {
      this.logger.warn(
        'RazorpayPaymentGateway created without credentials (Mock gateway recommended for dev)',
      );
    }
  }

  getProviderName(): PaymentProvider {
    return PaymentProvider.RAZORPAY;
  }

  async createOrder(params: CreateOrderParams): Promise<GatewayOrder> {
    if (!this.keyId || !this.keySecret) {
      throw new InternalServerErrorException(
        'Razorpay credentials are not configured in environment',
      );
    }

    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(params.amount * 100), // Razorpay requires amount in paise
          currency: params.currency || 'INR',
          receipt: params.receipt,
          notes: params.notes,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Razorpay createOrder failed: ${errorText}`);
        throw new BadRequestException(
          `Failed to create Razorpay order: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        id: string;
        amount: number;
        currency: string;
        status: string;
      };

      return {
        id: data.id,
        amount: Math.round(data.amount / 100), // back to INR
        currency: data.currency,
        status: data.status,
        provider: PaymentProvider.RAZORPAY,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error connecting to Razorpay: ${msg}`);
      throw new InternalServerErrorException(
        `Error connecting to payment gateway: ${msg}`,
      );
    }
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature || !this.webhookSecret) {
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
      this.logger.error(`Error verifying Razorpay webhook signature: ${err}`);
      return false;
    }
  }

  async refund(params: RefundParams): Promise<GatewayRefund> {
    if (!this.keyId || !this.keySecret) {
      throw new InternalServerErrorException(
        'Razorpay credentials are not configured in environment',
      );
    }

    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;

    try {
      const body: Record<string, unknown> = {};
      if (params.amount) {
        body.amount = Math.round(params.amount * 100);
      }
      if (params.reason) {
        body.notes = { reason: params.reason };
      }

      const response = await fetch(
        `${this.baseUrl}/payments/${params.paymentId}/refund`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Razorpay refund failed: ${errorText}`);
        throw new BadRequestException(
          `Failed to process refund: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as {
        id: string;
        amount: number;
        status: string;
      };

      return {
        id: data.id,
        amount: Math.round(data.amount / 100),
        status: data.status,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error executing Razorpay refund: ${msg}`);
      throw new InternalServerErrorException(`Refund failed: ${msg}`);
    }
  }
}
