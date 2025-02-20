import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ParkingRecord } from '../entities/parking-record.entity';

import { Payment } from '../entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParkingRecord, 
      Payment
    ])
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService]
})
export class DashboardModule {}