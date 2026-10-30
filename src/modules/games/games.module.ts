import { Module } from '@nestjs/common';
import { GamesService } from './games.service.js';
import { GamesController } from './games.controller.js';
import { BookingGamesController } from './booking-games.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RedisModule } from '../../common/redis/redis.module.js';

@Module({
  imports: [PrismaModule, RealtimeModule, RedisModule],
  controllers: [GamesController, BookingGamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
