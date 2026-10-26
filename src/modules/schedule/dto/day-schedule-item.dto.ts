import {
  IsEnum,
  IsString,
  IsInt,
  IsOptional,
  Matches,
  Min,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DayOfWeek } from '../../../generated/prisma/enums.js';

export class DayScheduleItemDto {
  @ApiProperty({
    enum: DayOfWeek,
    isArray: true,
    example: [
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
    ],
    description: 'One or more days this operating schedule applies to',
  })
  @IsEnum(DayOfWeek, { each: true })
  daysOfWeek: DayOfWeek[];

  @ApiProperty({
    example: '06:00',
    description: 'Opening time in 24h format (HH:mm)',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'openTime must be a valid 24h time in HH:mm format (e.g. 06:00)',
  })
  openTime: string;

  @ApiProperty({
    example: '22:00',
    description: 'Closing time in 24h format (HH:mm)',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'closeTime must be a valid 24h time in HH:mm format (e.g. 22:00)',
  })
  closeTime: string;

  @ApiPropertyOptional({
    example: 60,
    default: 60,
    description: 'Slot duration in minutes (30, 60, 90, 120)',
  })
  @IsOptional()
  @IsInt()
  @IsIn([30, 60, 90, 120])
  slotDurationMinutes?: number = 60;

  @ApiPropertyOptional({
    example: 800,
    description: 'Optional price override in INR for peak or weekend rates',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceOverride?: number;
}
