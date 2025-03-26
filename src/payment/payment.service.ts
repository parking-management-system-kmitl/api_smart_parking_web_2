// src/payment/payment.service.ts
import { 
    Injectable, 
    Logger, 
    NotFoundException,
    BadRequestException 
  } from '@nestjs/common';
  import { InjectRepository } from '@nestjs/typeorm';
  import { Repository } from 'typeorm';
  import { Payment } from '../entities/payment.entity';
  import { ParkingRecord } from '../entities/parking-record.entity';
  import { OmiseService } from './omise.service';
import { PaymentInitiateDto } from './dto/create-payment.dto';
  
  @Injectable()
  export class PaymentService {
    private readonly logger = new Logger(PaymentService.name);
  
    constructor(
      private omiseService: OmiseService, // แก้เป็นตัวเล็ก
    ) {}
  
    // src/payment/payment.service.ts
    async initiatePayment(paymentDto: PaymentInitiateDto) {
        try {
          // แปลง amount เป็น number
          const amount = typeof paymentDto.amount === 'string' 
            ? parseFloat(paymentDto.amount) 
            : paymentDto.amount;
      
          this.logger.log(`Initiating payment with amount: ${amount}`);
      
          // สร้าง source PromptPay ใน Omise
          const source = await this.omiseService.createSource(
            amount, 
            'THB'
          );
      
          this.logger.log(`Source created: ${JSON.stringify(source)}`);
          
          // สร้าง charge ใน Omise
          const charge = await this.omiseService.createCharge(
            source.id,
            amount,
            'THB',
            paymentDto.metadata || {}
          );
          
          // ดาวน์โหลด QR code
          let qrCodeUrl = null;
          if (charge.source?.scannable_code?.image?.download_uri) {
            qrCodeUrl = await this.omiseService.downloadQrCode(
              charge.source.scannable_code.image.download_uri,
              charge.id
            );
          }
          
          return {
            chargeId: charge.id,
            amount: amount,
            status: charge.status,
            qrCodeUrl: qrCodeUrl,
            expiresAt: charge.expires_at,
          };
        } catch (error) {
          this.logger.error(`Payment initiation error: ${JSON.stringify(error)}`);
          throw error;
        }
      }

  
  
    // เพิ่มเมธอดสำหรับเช็คสถานะการชำระเงิน
    async checkPaymentStatus(chargeId: string) {
      const charge = await this.omiseService.getCharge(chargeId);
      
      return {
        chargeId: charge.id,
        status: charge.status,
        paid: charge.paid,
        amount: charge.amount,
        paidAt: charge.paid_at
      };
    }
  }