import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { VenuesModule } from './modules/venues/venues.module.js';
import { CourtsModule } from './modules/courts/courts.module.js';
import { ScheduleModule } from './modules/schedule/schedule.module.js';
import { SlotsModule } from './modules/slots/slots.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { RedisModule } from './common/redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    VenuesModule,
    CourtsModule,
    ScheduleModule,
    SlotsModule,
    BookingsModule,
    RealtimeModule,
    JobsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
