import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentGatewayProvider, PAYMENT_GATEWAY } from './gateways/payment-gateway.provider.js';
import { MockPaymentGateway } from './gateways/mock-payment.gateway.js';
import { RazorpayPaymentGateway } from './gateways/razorpay-payment.gateway.js';
import { RealtimeModule } from '../realtime/realtime.module.js';

@Module({
  imports: [RealtimeModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentGatewayProvider,
    MockPaymentGateway,
    RazorpayPaymentGateway,
  ],
  exports: [PaymentsService, PAYMENT_GATEWAY],
})
export class PaymentsModule {}
