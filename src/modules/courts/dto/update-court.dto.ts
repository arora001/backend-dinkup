import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CourtSurface, CourtType } from '../../../generated/prisma/enums.js';

export class UpdateCourtDto {
  @ApiPropertyOptional({ example: 'Court 1 (Centre Court)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: CourtSurface })
  @IsOptional()
  @IsEnum(CourtSurface)
  surface?: CourtSurface;

  @ApiPropertyOptional({ enum: CourtType })
  @IsOptional()
  @IsEnum(CourtType)
  type?: CourtType;

  @ApiPropertyOptional({ example: 700 })
  @IsOptional()
  @IsInt()
  @Min(0)
  basePricePerHour?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}