// src/payment/payment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { OmiseService } from './omise.service';

import { Payment } from '../entities/payment.entity';
import { ParkingRecord } from '../entities/parking-record.entity';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([Payment, ParkingRecord])
  ],
  controllers: [PaymentController],
  providers: [PaymentService, OmiseService],
  exports: [PaymentService]
})
export class PaymentModule {}