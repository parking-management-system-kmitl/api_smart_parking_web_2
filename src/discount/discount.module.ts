// src/discount/discount.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { DiscountConfigurationEntity } from '../entities/discounts-configuration.entity';
import { Car } from '../entities/car.entity';
import { Payment } from '../entities/payment.entity';
import { ParkingRatesConfigurationEntity } from '../entities/parking-rates-configuration.entity';
import { EntryRecord } from '../entities/entry-record.entity';
import { OptionConfigurationEntity } from 'src/entities/option-configuration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DiscountConfigurationEntity, 
      Car,
      Payment,
      ParkingRatesConfigurationEntity,
      EntryRecord,
      OptionConfigurationEntity
    ])
  ],
  controllers: [DiscountController],
  providers: [DiscountService],
  exports: [DiscountService]
})
export class DiscountModule {}