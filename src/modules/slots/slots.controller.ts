import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SlotsService } from './slots.service.js';
import { GenerateSlotsDto } from './dto/generate-slots.dto.js';
import { SlotQueryDto } from './dto/slot-query.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Slots')
@Controller()
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Post('courts/:courtId/slots/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Host only: Materialize bookable slots from weekly schedules',
  })
  @ApiParam({ name: 'courtId', description: 'Court ID', type: Number })
  @ApiResponse({ status: 201, description: 'Slots materialized successfully' })
  @ApiResponse({ status: 400, description: 'Court has no schedules configured' })
  @ApiResponse({ status: 403, description: 'Forbidden - caller does not own this court' })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async generateSlots(
    @Param('courtId', ParseIntPipe) courtId: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
    @Body() dto: GenerateSlotsDto,
  ) {
    return this.slotsService.generateSlots(courtId, hostId, role, dto);
  }

  @Get('courts/:courtId/slots')
  @ApiOperation({
    summary: 'Public: Get live slot availability for a court on a date',
  })
  @ApiParam({ name: 'courtId', description: 'Court ID', type: Number })
  @ApiResponse({ status: 200, description: 'List of slots with live status' })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async getSlotsByDate(
    @Param('courtId', ParseIntPipe) courtId: number,
    @Query() query: SlotQueryDto,
  ) {
    return this.slotsService.getSlotsByDate(courtId, query.date);
  }

  @Post('slots/:id/hold')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Player: Atomic 5-minute hold on a slot (Double-booking safe)',
  })
  @ApiParam({ name: 'id', description: 'Slot ID to hold', type: Number })
  @ApiResponse({ status: 200, description: 'Slot successfully held for 5 minutes' })
  @ApiResponse({
    status: 409,
    description: 'Conflict: Slot already held by another player, booked, or blocked',
  })
  @ApiResponse({ status: 404, description: 'Slot not found' })
  async holdSlot(
    @Param('id', ParseIntPipe) slotId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.slotsService.holdSlot(slotId, userId);
  }

  @Post('slots/:id/release')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Player: Voluntarily release a held slot before 5-minute expiry',
  })
  @ApiParam({ name: 'id', description: 'Slot ID to release', type: Number })
  @ApiResponse({ status: 200, description: 'Slot hold released successfully' })
  @ApiResponse({ status: 400, description: 'Slot is not currently in HELD status' })
  @ApiResponse({ status: 403, description: 'Forbidden - caller does not hold this slot' })
  async releaseSlot(
    @Param('id', ParseIntPipe) slotId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.slotsService.releaseSlot(slotId, userId, role);
  }

  @Post('slots/:id/block')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Host only: Block a slot for maintenance or private event',
  })
  @ApiParam({ name: 'id', description: 'Slot ID to block', type: Number })
  @ApiResponse({ status: 200, description: 'Slot blocked successfully' })
  @ApiResponse({ status: 400, description: 'Cannot block an already booked slot' })
  @ApiResponse({ status: 403, description: 'Forbidden - caller does not own this court' })
  async blockSlot(
    @Param('id', ParseIntPipe) slotId: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.slotsService.blockSlot(slotId, hostId, role);
  }

  @Post('slots/:id/unblock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Host only: Unblock a previously blocked slot',
  })
  @ApiParam({ name: 'id', description: 'Slot ID to unblock', type: Number })
  @ApiResponse({ status: 200, description: 'Slot unblocked successfully' })
  @ApiResponse({ status: 400, description: 'Slot is not currently blocked' })
  @ApiResponse({ status: 403, description: 'Forbidden - caller does not own this court' })
  async unblockSlot(
    @Param('id', ParseIntPipe) slotId: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.slotsService.unblockSlot(slotId, hostId, role);
  }
}
