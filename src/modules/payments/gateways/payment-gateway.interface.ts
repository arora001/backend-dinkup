import { PaymentProvider } from '../../../generated/prisma/enums.js';

export interface CreateOrderParams {
  bookingId: number;
  amount: number; // in INR
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface GatewayOrder {
  id: string; // Gateway order ID (e.g. order_xxx or order_mock_xxx)
  amount: number; // in INR
  currency: string;
  status: string;
  provider: PaymentProvider;
}

export interface RefundParams {
  paymentId: string;
  amount?: number; // in INR
  reason?: string;
}

export interface GatewayRefund {
  id: string;
  amount: number;
  status: string;
}

export interface PaymentGateway {
  getProviderName(): PaymentProvider;
  createOrder(params: CreateOrderParams): Promise<GatewayOrder>;
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean;
  refund(params: RefundParams): Promise<GatewayRefund>;
}
