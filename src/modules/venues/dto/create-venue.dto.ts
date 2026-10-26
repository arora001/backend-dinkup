import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsUrl,
  IsEmail,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TricityCity } from '../../../generated/prisma/enums.js';

export class CreateVenueDto {
  @ApiProperty({ example: 'Mohali Pickleball Arena', description: 'Venue display name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Premium 4-court facility with tournament grade acrylic surface' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TricityCity, example: TricityCity.MOHALI })
  @IsEnum(TricityCity)
  city: TricityCity;

  @ApiProperty({ example: 'Phase 8 Industrial Area', description: 'Sector or locality' })
  @IsString()
  @IsNotEmpty()
  area: string;

  @ApiProperty({ example: 'Plot 42, Sector 82, JLPL Industrial Area, Mohali' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: 'https://maps.app.goo.gl/xyz' })
  @IsOptional()
  @IsUrl()
  googleMapsUrl?: string;

  @ApiPropertyOptional({ example: 30.6942 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 76.7321 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: '+919876543210', description: 'Front desk manager contact phone' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: '+919876543210', description: 'WhatsApp number for 1-tap inquiries' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: 'info@mohalipickleball.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ default: true, description: 'LED floodlighting for night games' })
  @IsOptional()
  @IsBoolean()
  hasLighting?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Paddle & ball rentals available' })
  @IsOptional()
  @IsBoolean()
  hasEquipmentRental?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasParking?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasWashroom?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasDrinkingWater?: boolean;

  @ApiPropertyOptional({ default: 6, description: 'Hours before slot for free cancellation' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cancellationCutoffHours?: number;
}