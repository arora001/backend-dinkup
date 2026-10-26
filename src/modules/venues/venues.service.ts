import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateVenueDto } from './dto/create-venue.dto.js';
import { UpdateVenueDto } from './dto/update-venue.dto.js';
import { VenueQueryDto } from './dto/venue-query.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(hostId: number, dto: CreateVenueDto) {
    const slug = await this.generateUniqueSlug(dto.name);

    return this.prisma.venue.create({
      data: {
        ...dto,
        hostId,
        slug,
      },
      include: {
        courts: true,
        images: true,
      },
    });
  }

  async findAll(query: VenueQueryDto) {
    const where: Prisma.VenueWhereInput = {
      isActive: true,
    };

    if (query.city) {
      where.city = query.city;
    }

    if (query.area) {
      where.area = {
        contains: query.area,
        mode: 'insensitive',
      };
    }

    if (query.hasLighting !== undefined) {
      where.hasLighting = query.hasLighting;
    }

    if (query.hasEquipmentRental !== undefined) {
      where.hasEquipmentRental = query.hasEquipmentRental;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { area: { contains: query.search, mode: 'insensitive' } },
        { address: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.venue.findMany({
      where,
      include: {
        courts: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            surface: true,
            type: true,
            basePricePerHour: true,
          },
        },
        images: {
          orderBy: { displayOrder: 'asc' },
        },
        _count: {
          select: { courts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(idOrSlug: string) {
    const isId = !isNaN(Number(idOrSlug));

    const venue = await this.prisma.venue.findFirst({
      where: isId ? { id: Number(idOrSlug) } : { slug: idOrSlug },
      include: {
        courts: {
          include: {
            schedules: true,
          },
        },
        images: {
          orderBy: { displayOrder: 'asc' },
        },
        host: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!venue) {
      throw new NotFoundException(`Venue '${idOrSlug}' not found`);
    }

    return venue;
  }

  async update(
    venueId: number,
    hostId: number,
    role: string,
    dto: UpdateVenueDto,
  ) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${venueId} not found`);
    }

    if (role !== Role.ADMIN && venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to update this venue',
      );
    }

    let slug = venue.slug;
    if (dto.name && dto.name !== venue.name) {
      slug = await this.generateUniqueSlug(dto.name, venueId);
    }

    return this.prisma.venue.update({
      where: { id: venueId },
      data: {
        ...dto,
        slug,
      },
      include: {
        courts: true,
        images: true,
      },
    });
  }

  async remove(venueId: number, hostId: number, role: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${venueId} not found`);
    }

    if (role !== Role.ADMIN && venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to delete this venue',
      );
    }

    // Hard delete - PostgreSQL CASCADE deletes child courts and images
    await this.prisma.venue.delete({
      where: { id: venueId },
    });

    return {
      message: 'Venue and all associated courts deleted successfully',
      deletedVenueId: venueId,
    };
  }

  private async generateUniqueSlug(name: string, excludeId?: number): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug || 'venue';
    let counter = 1;

    while (true) {
      const existing = await this.prisma.venue.findUnique({
        where: { slug },
      });

      if (!existing || (excludeId && existing.id === excludeId)) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }
}
