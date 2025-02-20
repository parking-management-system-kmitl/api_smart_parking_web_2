// src/parking/parking.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkingController } from './parking.controller';
import { ParkingService } from './parking.service';
import { Car } from '../entities/car.entity';
import { ParkingRecord } from '../entities/parking-record.entity';

import { Payment } from '../entities/payment.entity';
import { OptionConfigurationEntity } from 'src/entities/option-configuration.entity';
import { ParkingRatesConfigurationEntity } from 'src/entities/parking-rates-configuration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Car, 
      ParkingRecord,
      Payment,
      OptionConfigurationEntity // Add this line
,ParkingRatesConfigurationEntity
    ])
  ],
  controllers: [ParkingController],
  providers: [ParkingService]
})
export class ParkingModule {}