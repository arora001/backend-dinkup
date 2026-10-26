import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
import { CourtsService } from './courts.service.js';
import { CreateCourtDto } from './dto/create-court.dto.js';
import { UpdateCourtDto } from './dto/update-court.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Courts')
@Controller('courts')
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Host only: Add a court to a venue' })
  @ApiResponse({ status: 201, description: 'Court created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - caller does not own this venue' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async create(
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
    @Body() dto: CreateCourtDto,
  ) {
    return this.courtsService.create(hostId, role, dto);
  }

  @Get('venue/:venueId')
  @ApiOperation({ summary: 'Public: List all courts for a venue' })
  @ApiParam({ name: 'venueId', description: 'Venue ID', type: Number })
  @ApiResponse({ status: 200, description: 'List of courts' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async findByVenue(@Param('venueId', ParseIntPipe) venueId: number) {
    return this.courtsService.findByVenue(venueId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Public: Get single court details' })
  @ApiParam({ name: 'id', description: 'Court ID', type: Number })
  @ApiResponse({ status: 200, description: 'Court details' })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.courtsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Host only: Update court details' })
  @ApiParam({ name: 'id', description: 'Court ID', type: Number })
  @ApiResponse({ status: 200, description: 'Court updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - caller does not own this venue' })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.courtsService.update(id, hostId, role, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Host only: Hard delete a court' })
  @ApiParam({ name: 'id', description: 'Court ID', type: Number })
  @ApiResponse({ status: 200, description: 'Court permanently deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - caller does not own this venue' })
  @ApiResponse({ status: 404, description: 'Court not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.courtsService.remove(id, hostId, role);
  }
}
