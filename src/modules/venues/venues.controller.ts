import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { VenuesService } from './venues.service.js';
import { CreateVenueDto } from './dto/create-venue.dto.js';
import { UpdateVenueDto } from './dto/update-venue.dto.js';
import { VenueQueryDto } from './dto/venue-query.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Venues')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Host only: Create a new venue' })
  @ApiResponse({ status: 201, description: 'Venue created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires HOST or ADMIN role' })
  async create(
    @CurrentUser('id') hostId: number,
    @Body() dto: CreateVenueDto,
  ) {
    return this.venuesService.create(hostId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Public: Browse and filter active venues' })
  @ApiResponse({ status: 200, description: 'List of venues' })
  async findAll(@Query() query: VenueQueryDto) {
    return this.venuesService.findAll(query);
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Public: Get venue by ID or slug' })
  @ApiParam({ name: 'idOrSlug', description: 'Venue ID or unique slug', example: 'mohali-pickleball-arena' })
  @ApiResponse({ status: 200, description: 'Venue profile with courts and images' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.venuesService.findOne(idOrSlug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Host only: Update own venue' })
  @ApiParam({ name: 'id', description: 'Venue ID', type: Number })
  @ApiResponse({ status: 200, description: 'Venue updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the owner of this venue' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.update(id, hostId, role, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOST, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Host only: Hard delete own venue (cascades to all courts)' })
  @ApiParam({ name: 'id', description: 'Venue ID', type: Number })
  @ApiResponse({ status: 200, description: 'Venue and all associated courts deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the owner of this venue' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') hostId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.venuesService.remove(id, hostId, role);
  }
}
