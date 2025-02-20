// src/discounts/dto/apply-discount.dto.ts
import { IsNotEmpty, IsNumber } from 'class-validator';

export class ApplyDiscountDto {
  @IsNotEmpty()
  @IsNumber()
  car_id: number;

  @IsNotEmpty()
  @IsNumber()
  discount_id: number;
}