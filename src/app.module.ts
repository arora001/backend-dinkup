import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { VenuesModule } from './modules/venues/venues.module.js';
import { CourtsModule } from './modules/courts/courts.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    VenuesModule,
    CourtsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
