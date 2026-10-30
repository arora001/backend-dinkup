import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SkillLevel } from '../../../generated/prisma/enums.js';

export class CreateGameDto {
  @ApiPropertyOptional({
    example: 'Intermediate 3.5+ Doubles Dink & Drill',
    description: 'Catchy title for the open game',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({
    example:
      'Friendly competitive doubles session. Looking for players with solid third shot drops.',
    description: 'Additional notes or expectations for joining players',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    enum: SkillLevel,
    default: SkillLevel.OPEN,
    description: 'Target skill level for joining players',
  })
  @IsOptional()
  @IsEnum(SkillLevel)
  skillLevel?: SkillLevel = SkillLevel.OPEN;

  @ApiPropertyOptional({
    example: 4,
    default: 4,
    description: 'Total player capacity including the creator (typically 4 for doubles)',
    minimum: 2,
    maximum: 8,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(8)
  seatsTotal?: number = 4;

  @ApiPropertyOptional({
    example: 200,
    description:
      'Cost per seat in INR. If omitted, automatically splits booking total price equally across total seats.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pricePerSeat?: number;
}
