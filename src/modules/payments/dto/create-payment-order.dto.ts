import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsPositive } from 'class-validator';

export class CreatePaymentOrderDto {
  @ApiProperty({
    example: 10,
    description: 'The unique ID of the pending booking to create a payment order for',
  })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  bookingId: number;
}
