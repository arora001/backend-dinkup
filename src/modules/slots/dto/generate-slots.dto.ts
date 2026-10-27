import { IsOptional, IsInt, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateSlotsDto {
  @ApiPropertyOptional({
    example: '2026-10-27',
    description: 'Starting date in YYYY-MM-DD format (defaults to today)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be in YYYY-MM-DD format',
  })
  startDate?: string;

  @ApiPropertyOptional({
    example: 7,
    default: 7,
    description: 'Number of days ahead to generate slots for (1 to 30)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  daysAhead?: number = 7;
}
