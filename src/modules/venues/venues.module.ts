import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service.js';
import { VenuesController } from './venues.controller.js';
import { StorageService } from '../../common/storage/storage.service.js';

@Module({
  controllers: [VenuesController],
  providers: [VenuesService, StorageService],
  exports: [VenuesService],
})
export class VenuesModule {}
