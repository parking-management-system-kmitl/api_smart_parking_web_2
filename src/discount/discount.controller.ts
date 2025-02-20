import { Controller, Post, Body, Get, Param, Put, Delete } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { ApplyDiscountDto } from './dto/apply-discount.dto';

@Controller('discount')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}


  @Post('list')
  async listApplicableDiscounts(@Body() body: { car_id: number }) {
    return this.discountService.listApplicableDiscounts(body.car_id);
  }
  @Post('apply')
  async applyDiscount(@Body() applyDiscountDto: ApplyDiscountDto) {
    return this.discountService.applyDiscount(
      applyDiscountDto.car_id,
      applyDiscountDto.discount_id
    );
  }

}