import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VipPromotionController } from './vippromotion.controller';
import { VipPromotionService } from './vippromotion.service';
import { VipPromotion } from '../entities/vip-promotions';

@Module({
  imports: [
    // Import TypeORM module for the VipPromotion entity
    TypeOrmModule.forFeature([VipPromotion])
  ],
  controllers: [VipPromotionController],
  providers: [VipPromotionService],
  exports: [VipPromotionService] // Optional: export service if needed in other modules
})
export class VipPromotionModule {}