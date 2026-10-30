import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockPaymentGateway } from './mock-payment.gateway.js';
import { RazorpayPaymentGateway } from './razorpay-payment.gateway.js';

export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';

export const PaymentGatewayProvider: Provider = {
  provide: PAYMENT_GATEWAY,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const keyId = config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = config.get<string>('RAZORPAY_KEY_SECRET');

    if (keyId && keySecret) {
      return new RazorpayPaymentGateway(config);
    }

    return new MockPaymentGateway(config);
  },
};
