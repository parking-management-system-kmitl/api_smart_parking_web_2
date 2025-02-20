import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('VipPromotions')
export class VipPromotion {
    @PrimaryGeneratedColumn()
    vip_promotion_id: number;  // ID ของโปรโมชั่น

    @Column()
    days: number;  // จำนวนวันของโปรโมชั่น

    @Column('decimal', { precision: 10, scale: 2 })
    price: number;  // ราคา (บาท) ของโปรโมชั่น

    @Column({ default: true })
    isActive: boolean;  // สถานะว่าโปรโมชั่นยังใช้งานได้หรือไม่
}
