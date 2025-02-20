import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from '../entities/car.entity';
import { Vip } from './vip.service';
import { VipController } from './vip.controller';
import { Member } from 'src/entities/member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Car,Member])], // ลงทะเบียน Entity Car
  providers: [Vip], // ลงทะเบียน Service
  controllers: [VipController], // ลงทะเบียน Controller
  exports: [Vip], // ส่งออก Service เพื่อให้ module อื่นใช้งานได้
})
export class VipModule {}