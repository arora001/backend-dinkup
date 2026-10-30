import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ClaimSeatDto {
  @ApiPropertyOptional({
    example: 'Bringing my own paddle and balls',
    description: 'Optional note to the game creator',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
