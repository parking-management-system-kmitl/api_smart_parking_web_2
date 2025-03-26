// src/payment/omise.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface OmiseSourceParams {
  type: string;
  amount: number;
  currency: string;
  promptpay?: {
    name?: string;
    bank_code?: string;
    mobile_number?: string;
    id_type?: string;
    id_number?: string;
  };
}

@Injectable()
export class OmiseService {
  private readonly logger = new Logger(OmiseService.name);
  private readonly secretKey: string;
  private readonly publicKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.secretKey = this.configService.get<string>('OMISE_SECRET_KEY');
    this.publicKey = this.configService.get<string>('OMISE_PUBLIC_KEY'); // เพิ่มนี่

  }

  async createSource(
    amount: number, 
    currency: string = 'THB', 
    sourceDetails?: {
      name?: string;
      bank_code?: string;
      mobile_number?: string;
      id_type?: string;
      id_number?: string;
    }
  ) {
    try {
      const sourceParams: OmiseSourceParams = {
        type: 'promptpay',
        amount: Math.ceil(amount * 100), // แปลงเป็นสตางค์และปัดเศษ
        currency,
      };
  
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.omise.co/sources',
          sourceParams,
          {
            auth: {
              username: this.publicKey,
              password: '',
            },
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error creating Omise source: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }

  async createCharge(
    sourceId: string, 
    amount: number, 
    currency: string = 'THB', 
    metadata: any = {}
  ) {
    try {
      const chargePayload = {
        source: sourceId,
        amount: Math.ceil(amount * 100), // แปลงเป็นสตางค์และปัดเศษ
        currency,
        metadata,
      };
  
      this.logger.log(`Charge Payload: ${JSON.stringify(chargePayload)}`);
  
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.omise.co/charges',
          chargePayload,
          {
            auth: {
              username: this.secretKey, // ใช้ Secret Key สำหรับ Charge
              password: '',
            },
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          },
        ),
      );
      return response.data;
    } catch (error) {
      // Log chi tiết lỗi
      this.logger.error(`Full error details: ${JSON.stringify({
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })}`);
      throw error;
    }
  }

  async getCharge(chargeId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://api.omise.co/charges/${chargeId}`, {
          auth: {
            username: this.secretKey,
            password: '',
          },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error getting Omise charge: ${error.message}`);
      throw error;
    }
  }

  async downloadQrCode(downloadUrl: string, chargeId: string): Promise<string> {
    try {
      // สร้างไดเร็กทอรีถ้ายังไม่มี
      const qrDir = path.join(process.cwd(), 'public', 'qrcodes');
      if (!fs.existsSync(qrDir)) {
        fs.mkdirSync(qrDir, { recursive: true });
      }

      const response = await firstValueFrom(
        this.httpService.get(downloadUrl, {
          auth: {
            username: this.secretKey,
            password: '',
          },
          responseType: 'arraybuffer',
        }),
      );

      const qrFileName = `qr_${chargeId}.svg`;
      const qrFilePath = path.join(qrDir, qrFileName);
      
      fs.writeFileSync(qrFilePath, response.data);
      
      return `/qrcodes/${qrFileName}`;
    } catch (error) {
      this.logger.error(`Error downloading QR code: ${error.message}`);
      throw error;
    }
  }

//   verifyWebhookSignature(payload: any, signature: string): boolean {
//     if (!this.webhookSecret) {
//       this.logger.warn('Webhook secret not configured. Skipping signature verification.');
//       return true;
//     }

//     try {
//       const calculatedSignature = crypto
//         .createHmac('sha256', this.webhookSecret)
//         .update(JSON.stringify(payload))
//         .digest('hex');
        
//       return signature === calculatedSignature;
//     } catch (error) {
//       this.logger.error(`Error verifying webhook signature: ${error.message}`);
//       return false;
//     }
//   }

  async mockPayCharge(chargeId: string) {
  try {
    // First, verify the charge exists and is in a state that can be mocked
    const charge = await this.getCharge(chargeId);

    // Check if the charge is in a state that can be mocked
    if (charge.status !== 'pending') {
      throw new Error('Charge cannot be mocked');
    }

    // In a real scenario, you'd use Omise's specific mock API
    // But since that's not working, we'll simulate a successful payment
    return {
      id: chargeId,
      status: 'successful',
      paid: true,
      amount: charge.amount,
      paid_at: new Date().toISOString()
    };
  } catch (error) {
    this.logger.error(`Error mocking Omise charge: ${error.message}`);
    throw error;
  }
}
}