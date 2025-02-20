import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { Vip } from './vip.service';
import { Car } from '../entities/car.entity';
import { UpdateCarDto } from './dto/update-car.dto';

interface UpdateVipDto {
    vip_days?: number;
    f_name?: string;
    l_name?: string;
    phone?: string;
  }

@Controller('vip')
export class VipController {
  constructor(private readonly VipService: Vip) {}

  @Get('getvip')
async getActiveVipCars(
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10,
): Promise<{ data: Car[]; total: number }> {
  return this.VipService.getActiveVipCars(page, limit);
}

@Put(':carId') // Use PUT for updates, and include the carId as a parameter
  async updateVip(
    @Param('carId', ParseIntPipe) carId: number, // Validate carId is an integer
    @Body() data: UpdateVipDto,
  ) {
    try {
      const updatedCar = await this.VipService.updateVip(carId, data);
      return {
        message: 'VIP details updated successfully',
        car: updatedCar, // Return the updated car details
      };
    } catch (error) {
      // Handle errors appropriately (e.g., log them, return specific error messages)
      throw error; // Re-throw the error for global exception handling or handle it here
    }
  }

  @Put('updatelp/:carId')
  async updateLicensePlate(
    @Param('carId', ParseIntPipe) carId: number,
    @Body('license_plate') newLicensePlate: string, 
  ) {
    try {
      const updatedCar = await this.VipService.updateLicensePlate(carId, newLicensePlate);
      return {
        message: 'License plate updated successfully',
        car: updatedCar,
      };
    } catch (error) {
      // Handle exceptions appropriately (e.g., NotFoundException, BadRequestException)
      throw error; 
    }
  }

  @Put('cancelvip/:carId')
  async cancelVip(
    @Param('carId', ParseIntPipe) carId: number,
  ) {
    try {
      const updatedCar = await this.VipService.cancelVip(carId);
      return {
        message: 'VIP status cancelled successfully',
        car: updatedCar,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(error.message);
      } else {
        throw error; // Re-throw other errors or handle them as needed
      }
    }
  }

}