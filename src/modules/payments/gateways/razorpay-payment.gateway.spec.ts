import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { RazorpayPaymentGateway } from './razorpay-payment.gateway.js';
import { PaymentProvider } from '../../../generated/prisma/enums.js';

describe('RazorpayPaymentGateway', () => {
  let gateway: RazorpayPaymentGateway;
  let config: jest.Mocked<ConfigService>;
  const mockWebhookSecret = 'rzp_test_secret_xyz';

  beforeEach(() => {
    config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_key123';
        if (key === 'RAZORPAY_KEY_SECRET') return 'rzp_test_secret456';
        if (key === 'RAZORPAY_WEBHOOK_SECRET') return mockWebhookSecret;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    gateway = new RazorpayPaymentGateway(config);
  });

  it('reports provider name as RAZORPAY', () => {
    expect(gateway.getProviderName()).toBe(PaymentProvider.RAZORPAY);
  });

  it('correctly verifies valid HMAC webhook signature', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    const signature = createHmac('sha256', mockWebhookSecret)
      .update(Buffer.from(rawBody, 'utf8'))
      .digest('hex');

    const isValid = gateway.verifyWebhookSignature(rawBody, signature);
    expect(isValid).toBe(true);
  });

  it('rejects tampered webhook signature', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    const isInvalid = gateway.verifyWebhookSignature(
      rawBody,
      'invalid_signature',
    );
    expect(isInvalid).toBe(false);
  });

  it('rejects verification when signature is empty', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    expect(gateway.verifyWebhookSignature(rawBody, '')).toBe(false);
  });
});
