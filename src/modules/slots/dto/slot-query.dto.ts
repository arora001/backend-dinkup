import { IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SlotQueryDto {
  @ApiProperty({
    example: '2026-10-27',
    description: 'Date to view availability for in YYYY-MM-DD format',
  })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format (e.g. 2026-10-27)',
  })
  date: string;
}
