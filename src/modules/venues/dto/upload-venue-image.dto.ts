import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadVenueImageDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Image file (.jpg, .jpeg, .png, .webp up to 5 MB)',
  })
  file?: any;

  @ApiPropertyOptional({
    description: 'Whether this image should be set as the main cover photo for the venue',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isCover?: boolean = false;

  @ApiPropertyOptional({
    description: 'Display order of the image in the gallery (0, 1, 2...)',
    default: 0,
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 0))
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}
