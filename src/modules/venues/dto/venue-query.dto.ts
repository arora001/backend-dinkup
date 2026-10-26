import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TricityCity } from '../../../generated/prisma/enums.js';

export class VenueQueryDto {
  @ApiPropertyOptional({ enum: TricityCity })
  @IsOptional()
  @IsEnum(TricityCity)
  city?: TricityCity;

  @ApiPropertyOptional({ description: 'Filter by area e.g. Sector 8' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ description: 'Search venue name or area' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasLighting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasEquipmentRental?: boolean;
}