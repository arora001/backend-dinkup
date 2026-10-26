import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ScheduleService } from './schedule.service.js';
import { SetWeeklyScheduleDto } from './dto/set-weekly-schedule.dto.js';
import { UpdateDayScheduleDto } from './dto/update-day-schedule.dto.js';
import { DayOfWeek } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Schedules')
@Controller('courts/:courtId/schedules')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Host only: Set or replace the weekly operating schedule for a court',
  })
  @ApiParam({ name: 'courtId', description: 'Court ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Weekly schedule set successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request (invalid 24h time, duplicate days, or openTime >= closeTime)',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - caller does not own the venue for this court',
  })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async setWeeklySchedule(
    @Param('courtId', ParseIntPipe) courtId: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
    @Body() dto: SetWeeklyScheduleDto,
  ) {
    return this.scheduleService.setWeeklySchedule(courtId, hostId, role, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Public: Get a court weekly operating schedule template',
  })
  @ApiParam({ name: 'courtId', description: 'Court ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Weekly operating schedule sorted Monday through Sunday',
  })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async findByCourt(@Param('courtId', ParseIntPipe) courtId: number) {
    return this.scheduleService.findByCourt(courtId);
  }

  @Patch(':dayOfWeek')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Host only: Update operating hours or pricing for a single day',
  })
  @ApiParam({ name: 'courtId', description: 'Court ID', type: Number })
  @ApiParam({
    name: 'dayOfWeek',
    enum: DayOfWeek,
    description: 'Day of week to update',
    example: DayOfWeek.SUNDAY,
  })
  @ApiResponse({ status: 200, description: 'Day schedule updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Court or schedule for that day not found' })
  async updateDay(
    @Param('courtId', ParseIntPipe) courtId: number,
    @Param('dayOfWeek', new ParseEnumPipe(DayOfWeek)) dayOfWeek: DayOfWeek,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
    @Body() dto: UpdateDayScheduleDto,
  ) {
    return this.scheduleService.updateDay(courtId, dayOfWeek, hostId, role, dto);
  }

  @Delete(':dayOfWeek')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Host only: Mark court closed on a specific day (removes schedule row)',
  })
  @ApiParam({ name: 'courtId', description: 'Court ID', type: Number })
  @ApiParam({
    name: 'dayOfWeek',
    enum: DayOfWeek,
    description: 'Day of week to delete',
    example: DayOfWeek.MONDAY,
  })
  @ApiResponse({
    status: 200,
    description: 'Schedule removed (Court marked closed on that day)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async removeDay(
    @Param('courtId', ParseIntPipe) courtId: number,
    @Param('dayOfWeek', new ParseEnumPipe(DayOfWeek)) dayOfWeek: DayOfWeek,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.scheduleService.removeDay(courtId, dayOfWeek, hostId, role);
  }
}
