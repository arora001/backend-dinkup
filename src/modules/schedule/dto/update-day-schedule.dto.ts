import {
  IsString,
  IsInt,
  IsOptional,
  Matches,
  Min,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDayScheduleDto {
  @ApiPropertyOptional({
    example: '07:00',
    description: 'Opening time in 24h format (HH:mm)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'openTime must be a valid 24h time in HH:mm format (e.g. 07:00)',
  })
  openTime?: string;

  @ApiPropertyOptional({
    example: '23:00',
    description: 'Closing time in 24h format (HH:mm)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'closeTime must be a valid 24h time in HH:mm format (e.g. 23:00)',
  })
  closeTime?: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'Slot duration in minutes (30, 60, 90, 120)',
  })
  @IsOptional()
  @IsInt()
  @IsIn([30, 60, 90, 120])
  slotDurationMinutes?: number;

  @ApiPropertyOptional({
    example: 850,
    description: 'Optional price override in INR',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceOverride?: number;
}
