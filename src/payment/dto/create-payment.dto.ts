// src/payment/dto/create-payment.dto.ts
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class PaymentInitiateDto {
  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsOptional()
  metadata?: Record<string, any>;
}