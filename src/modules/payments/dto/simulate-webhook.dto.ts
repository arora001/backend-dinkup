import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class SimulateWebhookDto {
  @ApiProperty({
    example: 10,
    description: 'The unique ID of the booking to simulate a webhook confirmation for',
  })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  bookingId: number;

  @ApiPropertyOptional({
    example: 'payment.captured',
    default: 'payment.captured',
    description: 'Webhook event type to simulate',
  })
  @IsOptional()
  @IsString()
  eventType?: string = 'payment.captured';
}
