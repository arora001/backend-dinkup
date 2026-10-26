import { Type } from 'class-transformer';
import { ValidateNested, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DayScheduleItemDto } from './day-schedule-item.dto.js';

export class SetWeeklyScheduleDto {
  @ApiProperty({
    type: [DayScheduleItemDto],
    description: 'List of operating schedule templates for days of the week',
  })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => DayScheduleItemDto)
  schedules: DayScheduleItemDto[];
}
