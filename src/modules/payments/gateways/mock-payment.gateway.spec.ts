import { ConfigService } from '@nestjs/config';
import { MockPaymentGateway } from './mock-payment.gateway.js';
import { PaymentProvider } from '../../../generated/prisma/enums.js';

describe('MockPaymentGateway', () => {
  let gateway: MockPaymentGateway;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'PAYMENT_MOCK_WEBHOOK_SECRET') {
          return 'test_mock_secret_123';
        }
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    gateway = new MockPaymentGateway(config);
  });

  it('reports provider name as MOCK', () => {
    expect(gateway.getProviderName()).toBe(PaymentProvider.MOCK);
  });

  it('creates a mock order with expected amount and order_mock_ prefix', async () => {
    const order = await gateway.createOrder({
      bookingId: 42,
      amount: 800,
      receipt: 'DNK-REC-42',
    });

    expect(order.id).toMatch(/^order_mock_/);
    expect(order.amount).toBe(800);
    expect(order.currency).toBe('INR');
    expect(order.status).toBe('created');
    expect(order.provider).toBe(PaymentProvider.MOCK);
  });

  it('correctly verifies valid mock HMAC signature', () => {
    const { signature, rawBody } = gateway.generateMockWebhookPayload({
      eventType: 'payment.captured',
      orderId: 'order_mock_test123',
      amount: 800,
    });

    const isValid = gateway.verifyWebhookSignature(rawBody, signature);
    expect(isValid).toBe(true);
  });

  it('rejects invalid or tampered HMAC signature', () => {
    const { rawBody } = gateway.generateMockWebhookPayload({
      eventType: 'payment.captured',
      orderId: 'order_mock_test123',
      amount: 800,
    });

    const isInvalid = gateway.verifyWebhookSignature(
      rawBody,
      'tampered_fake_signature',
    );
    expect(isInvalid).toBe(false);
  });

  it('processes mock refund successfully', async () => {
    const refund = await gateway.refund({
      paymentId: 'pay_mock_123',
      amount: 800,
      reason: 'Slot expired',
    });

    expect(refund.id).toMatch(/^rfnd_mock_/);
    expect(refund.amount).toBe(800);
    expect(refund.status).toBe('processed');
  });
});
