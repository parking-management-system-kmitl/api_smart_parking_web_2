// src/payment/payment.controller.ts
import { 
    Controller, 
    Post, 
    Get, 
    Body, 
    Param, 
    Headers, 
    HttpStatus, 
    HttpCode, 
    UnauthorizedException,
    Logger 
  } from '@nestjs/common';
  import { PaymentService } from './payment.service';
  import { PaymentInitiateDto } from './dto/create-payment.dto';
import { OmiseService } from './omise.service';

  
  // payment.controller.ts
@Controller('api/payments')
export class PaymentController {
  constructor(
    private paymentService: PaymentService,
    private omiseService : OmiseService,
  ) {}

  @Post('initiate')
  async initiatePayment(@Body() paymentDto: PaymentInitiateDto) {
    return await this.paymentService.initiatePayment(paymentDto);
  }

  @Get('status/:chargeId')
  async checkPaymentStatus(@Param('chargeId') chargeId: string) {
    return await this.paymentService.checkPaymentStatus(chargeId);
  }


  @Post('mock-payment/:chargeId')
async mockPayment(@Param('chargeId') chargeId: string) {
  return await this.omiseService.mockPayCharge(chargeId);
}
}