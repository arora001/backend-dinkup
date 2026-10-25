import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto, LoginDto } from './dto/index.js';
import { JwtPayload } from '../../common/types/jwt-payload.js';
import { Role } from '../../common/enums/role.enum.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === Role.ADMIN) {
      throw new BadRequestException('Admin role cannot be self-assigned');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email.toLowerCase().trim() },
          ...(dto.phone ? [{ phone: dto.phone.trim() }] : []),
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === dto.email.toLowerCase().trim()) {
        throw new ConflictException('Email already in use');
      }
      throw new ConflictException('Phone number already in use');
    }

    const hashedPassword = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
        phone: dto.phone?.trim() || null,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    const accessToken = await this.generateToken(user.id, user.email, user.role);

    return {
      message: 'Account registered successfully',
      accessToken,
      user,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    const isPasswordValid = await argon2.verify(user.password, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.generateToken(user.id, user.email, user.role);

    return {
      message: 'Logged in successfully',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async deleteMyAccount(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    // Hard delete - row is permanently removed from tbl_user
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      message: 'Account deleted successfully',
      deletedUserId: userId,
    };
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteUserById(userId: number, currentAdminId: number) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (userId === currentAdminId) {
      throw new BadRequestException(
        'Admins cannot delete their own account using the admin endpoint. Use DELETE /auth/me instead.',
      );
    }

    // Hard delete - row is permanently removed from tbl_user
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      message: `User with ID ${userId} permanently deleted by administrator`,
      deletedUserId: userId,
    };
  }

  private async generateToken(userId: number, email: string, role: string): Promise<string> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
    };

    return this.jwtService.signAsync(payload);
  }
}
