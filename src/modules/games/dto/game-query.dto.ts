import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TricityCity,
  SkillLevel,
  GameStatus,
} from '../../../generated/prisma/enums.js';

export class GameQueryDto {
  @ApiPropertyOptional({
    enum: TricityCity,
    description: 'Filter open games by Tricity metropolitan area',
  })
  @IsOptional()
  @IsEnum(TricityCity)
  city?: TricityCity;

  @ApiPropertyOptional({
    example: 'Sector 8',
    description: 'Filter by specific neighborhood or sector',
  })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({
    example: '2026-10-30',
    description: 'Filter by court booking date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date must be formatted as YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({
    enum: SkillLevel,
    description: 'Filter by required player skill rating tier',
  })
  @IsOptional()
  @IsEnum(SkillLevel)
  skillLevel?: SkillLevel;

  @ApiPropertyOptional({
    enum: GameStatus,
    default: GameStatus.OPEN,
    description: 'Filter by game status (OPEN, FULL, CANCELLED)',
  })
  @IsOptional()
  @IsEnum(GameStatus)
  status?: GameStatus;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number for pagination',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Items per page (max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
