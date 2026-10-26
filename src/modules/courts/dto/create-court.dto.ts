import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsEnum,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourtSurface, CourtType } from '../../../generated/prisma/enums.js';

export class CreateCourtDto {
  @ApiProperty({ example: 1, description: 'ID of the venue this court belongs to' })
  @IsInt()
  venueId: number;

  @ApiProperty({ example: 'Court 1 (Centre Court)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ enum: CourtSurface, default: CourtSurface.CUSHIONED_ACRYLIC })
  @IsOptional()
  @IsEnum(CourtSurface)
  surface?: CourtSurface;

  @ApiPropertyOptional({ enum: CourtType, default: CourtType.OUTDOOR })
  @IsOptional()
  @IsEnum(CourtType)
  type?: CourtType;

  @ApiProperty({ example: 600, description: 'Base rate per hour in INR' })
  @IsInt()
  @Min(0)
  basePricePerHour: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}