import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { VipPromotionService } from './vippromotion.service';
import { VipPromotion } from '../entities/vip-promotions';

@Controller('vip-promotions')
export class VipPromotionController {
    constructor(private readonly vipPromotionService: VipPromotionService) {}

    // API เพื่อดึงโปรโมชั่นทั้งหมด
    @Get()
    async getAllPromotions(): Promise<VipPromotion[]> {
        return this.vipPromotionService.getAllPromotions();
    }

    // API เพื่อดึงโปรโมชั่นที่ Active
    @Get('active')
    async getActivePromotion(): Promise<VipPromotion | undefined> {
        return this.vipPromotionService.getActivePromotion();
    }

    // API เพื่อดึงโปรโมชั่นตาม ID
    @Get(':id')
    async getPromotionById(@Param('id') id: number): Promise<VipPromotion> {
        return this.vipPromotionService.getPromotionById(id);
    }

    // API เพื่อเพิ่มโปรโมชั่นใหม่
    @Post()
    async createPromotion(
        @Body('days') days: number,
        @Body('price') price: number,
    ): Promise<VipPromotion> {
        return this.vipPromotionService.createPromotion(days, price);
    }

    // API เพื่ออัพเดทโปรโมชั่น
    @Put(':id')
    async updatePromotion(
        @Param('id') id: number,
        @Body('days') days: number,
        @Body('price') price: number,
    ): Promise<VipPromotion> {
        return this.vipPromotionService.updatePromotion(id, days, price);
    }

    // API เพื่อลบโปรโมชั่น
    @Delete(':id')
    async deletePromotion(@Param('id') id: number): Promise<void> {
        return this.vipPromotionService.deletePromotion(id);
    }

    // API เพื่อเปิดสถานะโปรโมชั่นให้เป็น Active
    @Put('activate/:id')
    async activatePromotion(@Param('id') id: number): Promise<VipPromotion> {
        return this.vipPromotionService.activateSinglePromotion(id);
    }
}
