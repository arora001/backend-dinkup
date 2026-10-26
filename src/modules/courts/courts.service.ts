import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCourtDto } from './dto/create-court.dto.js';
import { UpdateCourtDto } from './dto/update-court.dto.js';
import { Role } from '../../common/enums/role.enum.js';

@Injectable()
export class CourtsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(hostId: number, role: string, dto: CreateCourtDto) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: dto.venueId },
    });

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${dto.venueId} not found`);
    }

    if (role !== Role.ADMIN && venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You can only add courts to venues that you own',
      );
    }

    return this.prisma.court.create({
      data: dto,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            city: true,
            area: true,
          },
        },
      },
    });
  }

  async findByVenue(venueId: number) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${venueId} not found`);
    }

    return this.prisma.court.findMany({
      where: { venueId },
      include: {
        schedules: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(courtId: number) {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      include: {
        venue: true,
        schedules: true,
      },
    });

    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }

    return court;
  }

  async update(
    courtId: number,
    hostId: number,
    role: string,
    dto: UpdateCourtDto,
  ) {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      include: { venue: true },
    });

    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }

    if (role !== Role.ADMIN && court.venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to update this court',
      );
    }

    return this.prisma.court.update({
      where: { id: courtId },
      data: dto,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            city: true,
            area: true,
          },
        },
      },
    });
  }

  async remove(courtId: number, hostId: number, role: string) {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      include: { venue: true },
    });

    if (!court) {
      throw new NotFoundException(`Court with ID ${courtId} not found`);
    }

    if (role !== Role.ADMIN && court.venue.hostId !== hostId) {
      throw new ForbiddenException(
        'You do not have permission to delete this court',
      );
    }

    // Hard delete court
    await this.prisma.court.delete({
      where: { id: courtId },
    });

    return {
      message: 'Court deleted successfully',
      deletedCourtId: courtId,
    };
  }
}
