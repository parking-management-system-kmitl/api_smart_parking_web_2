import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VipPromotion } from '../entities/vip-promotions';

@Injectable()
export class VipPromotionService {
    constructor(
        @InjectRepository(VipPromotion)
        private readonly vipPromotionRepository: Repository<VipPromotion>,
    ) {}

    // ฟังก์ชันเพื่อตั้งค่าให้โปรโมชั่นที่มี id เป็น Active และทำให้โปรโมชั่นอื่นๆ เป็น Inactive
    async activateSinglePromotion(id: number): Promise<VipPromotion> {
        // 1. ทำให้โปรโมชั่นทั้งหมดเป็น Inactive
        await this.vipPromotionRepository.update({ isActive: true }, { isActive: false });

        // 2. ทำให้โปรโมชั่นที่มี id เป็น Active
        const promotion = await this.vipPromotionRepository.findOne({ where: { vip_promotion_id: id } });
        if (!promotion) {
            throw new NotFoundException(`Promotion with ID ${id} not found`);
        }
        promotion.isActive = true;
        return this.vipPromotionRepository.save(promotion);
    }

    // ฟังก์ชันเพื่อดึงข้อมูลโปรโมชั่นทั้งหมด
    // ใน VipPromotionService
async getAllPromotions(): Promise<VipPromotion[]> {
    return this.vipPromotionRepository.find({
        order: {
            isActive: 'DESC',  // เรียงโปรโมชั่นที่ Active ให้อยู่บน
            vip_promotion_id: 'ASC' // และเรียงตาม ID ต่อ
        }
    });
}


    // ฟังก์ชันเพื่อดึงข้อมูลโปรโมชั่นที่ Active
    async getActivePromotion(): Promise<VipPromotion | undefined> {
        return this.vipPromotionRepository.findOne({ where: { isActive: true } });
    }

    // ฟังก์ชันเพื่อดึงข้อมูลโปรโมชั่นตาม ID
    async getPromotionById(id: number): Promise<VipPromotion> {
        const promotion = await this.vipPromotionRepository.findOne({ where: { vip_promotion_id: id } });
        if (!promotion) {
            throw new NotFoundException(`Promotion with ID ${id} not found`);
        }
        return promotion;
    }

    // ฟังก์ชันเพื่อเพิ่มโปรโมชั่นใหม่
    async createPromotion(days: number, price: number): Promise<VipPromotion> {
        const newPromotion = this.vipPromotionRepository.create({ 
            days, 
            price, 
            isActive: false  // ตั้งค่า isActive เป็น false ตอนสร้าง
        });
        return this.vipPromotionRepository.save(newPromotion);
    }
    // ฟังก์ชันเพื่ออัพเดทโปรโมชั่น
    async updatePromotion(id: number, days: number, price: number): Promise<VipPromotion> {
        const promotion = await this.vipPromotionRepository.findOne({ where: { vip_promotion_id: id } });
        if (!promotion) {
            throw new NotFoundException(`Promotion with ID ${id} not found`);
        }
        promotion.days = days;
        promotion.price = price;
        return this.vipPromotionRepository.save(promotion);
    }

    // ฟังก์ชันเพื่อลบโปรโมชั่น
    async deletePromotion(id: number): Promise<void> {
        const promotion = await this.vipPromotionRepository.findOne({ where: { vip_promotion_id: id } });
        if (!promotion) {
            throw new NotFoundException(`Promotion with ID ${id} not found`);
        }
        await this.vipPromotionRepository.remove(promotion);
    }
}
