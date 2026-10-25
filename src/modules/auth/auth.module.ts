import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from '../../strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';
import { RolesGuard } from '../../guards/roles.guard.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') ||
          process.env.JWT_SECRET ||
          'dinkup-chandigarh-pickleball-secret-key-change-in-prod',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ||
            '7d') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, PassportModule, JwtModule],
})
export class AuthModule {}
