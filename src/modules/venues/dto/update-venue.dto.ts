import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateVenueDto } from './create-venue.dto.js';

export class UpdateVenueDto extends PartialType(CreateVenueDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}