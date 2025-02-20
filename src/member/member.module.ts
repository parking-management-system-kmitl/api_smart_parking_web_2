import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member } from '../entities/member.entity';
import { Car } from '../entities/car.entity';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { VipPromotion } from 'src/entities/vip-promotions';

@Module({
  imports: [
    TypeOrmModule.forFeature([Member, Car ,VipPromotion])
  ],
  controllers: [MemberController],
  providers: [MemberService],
  exports: [MemberService]
})
export class MemberModule {}