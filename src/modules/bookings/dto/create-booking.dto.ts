import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsPositive } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({
    example: 42,
    description: 'The unique ID of the court slot to book',
  })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  slotId: number;
}
