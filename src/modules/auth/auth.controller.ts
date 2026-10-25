import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  ParseIntPipe,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';
import { CurrentUser } from '../../decorators/current-user.decorator.js';
import { Roles } from '../../decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user (Player or Host)' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Validation failed or attempted to register as ADMIN' })
  @ApiResponse({ status: 409, description: 'Email or phone already registered' })
  async signup(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: any) {
    return user;
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Permanently delete own account (hard delete)' })
  @ApiResponse({ status: 200, description: 'Account permanently deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async deleteMyAccount(@CurrentUser('id') userId: number) {
    return this.authService.deleteMyAccount(userId);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin only: List all registered users' })
  @ApiResponse({ status: 200, description: 'List of all users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  async getAllUsers() {
    return this.authService.getAllUsers();
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin only: Permanently delete a user by ID' })
  @ApiParam({ name: 'id', description: 'User ID to delete', type: Number })
  @ApiResponse({ status: 200, description: 'User permanently deleted' })
  @ApiResponse({ status: 400, description: 'Bad request (e.g. self-deletion attempt via admin endpoint)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') adminId: number,
  ) {
    return this.authService.deleteUserById(id, adminId);
  }
}
