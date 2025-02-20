import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DiscountConfigurationEntity, CustomerType } from '../entities/discounts-configuration.entity';
import { Car } from '../entities/car.entity';
import { Payment } from 'src/entities/payment.entity';
import { ParkingRatesConfigurationEntity } from 'src/entities/parking-rates-configuration.entity';
import { ParkingRecord } from 'src/entities/parking-record.entity'; // Import ParkingRecord
import { OptionConfigurationEntity } from 'src/entities/option-configuration.entity';

@Injectable()
export class DiscountService {
  constructor(
    @InjectRepository(DiscountConfigurationEntity)
    private discountRepository: Repository<DiscountConfigurationEntity>,
    @InjectRepository(Car)
    private carRepository: Repository<Car>,

    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(ParkingRatesConfigurationEntity)
    private ratesRepo: Repository<ParkingRatesConfigurationEntity>,
    @InjectRepository(ParkingRecord)
    private ParkingRecordRepo: Repository<ParkingRecord>,

    @InjectRepository(OptionConfigurationEntity)
    private optionRepo: Repository<OptionConfigurationEntity>,
  ) {}

  async listApplicableDiscounts(carId: number) {
    // Find the car
    const car = await this.carRepository.findOne({
      where: { car_id: carId }
    });

    if (!car) {
      throw new NotFoundException(`Car with ID ${carId} not found`);
    }

    // Determine if the car is VIP
    const today = new Date();
    const isVip = car.vip_expiry_date !== null && car.vip_expiry_date > today;

    // Prepare query filter based on VIP status
    const customerTypes = isVip 
      ? [CustomerType.ALL, CustomerType.VIP] 
      : [CustomerType.ALL, CustomerType.GENERAL];

    // Get applicable discount configurations
    const discounts = await this.discountRepository.find({
      where: {
        is_active: true,
        customer_type: In(customerTypes)
      },
      order: {
        min_purchase: 'ASC'
      }
    });

    return {
      car_id: carId,
      is_vip: isVip,
      applicable_discounts: discounts
    };
  }

  async applyDiscount(carId: number, discountId: number) {
    // Find the car
    const car = await this.carRepository.findOne({
      where: { car_id: carId }
    });

    if (!car) {
      throw new NotFoundException(`Car with ID ${carId} not found`);
    }

    // Find the discount configuration
    const discount = await this.discountRepository.findOne({
      where: { discount_id: discountId, is_active: true }
    });

    if (!discount) {
      throw new NotFoundException(`Discount with ID ${discountId} not found or is inactive`);
    }

    // Verify that the discount is applicable to the car
    const today = new Date();
    const isVip = car.vip_expiry_date !== null && car.vip_expiry_date > today;
    
    if (
      (discount.customer_type === CustomerType.VIP && !isVip) ||
      (discount.customer_type === CustomerType.GENERAL && isVip)
    ) {
      throw new BadRequestException(`Discount is not applicable to this car's customer type`);
    }

    // Find the latest entry record for the car
    const latestEntry = await this.ParkingRecordRepo.findOne({
      where: { car: { car_id: carId } },
      order: { entry_time: 'DESC' }
    });

    if (!latestEntry) {
      throw new NotFoundException(`No entry record found for car with ID ${carId}`);
    }

    // Find the latest payment for the entry
    const latestPayment = await this.paymentRepo.findOne({
      where: { parkingRecord: { parking_record_id: latestEntry.parking_record_id } }, // Use parking_record_id
      order: { paid_at: 'DESC' }
    });

    if (!latestPayment) {
      throw new NotFoundException(`No payment found for the latest entry of car with ID ${carId}`);
    }

    // Get applicable parking rates
    const parkingRates = await this.ratesRepo.find({
      order: { hours: 'ASC' }
    });

    if (!parkingRates || parkingRates.length === 0) {
      throw new NotFoundException(`No parking rate configuration found`);
    }

    // Get options configuration for overflow rate
    const options = await this.optionRepo.findOne({
      where: {},  // Empty where clause to get the first record
      order: { parking_option_id: 'ASC' }
    });
    
    if (!options) {
      throw new NotFoundException(`No option configuration found`);
    }

    // Calculate parking duration in hours
    const entryTime = new Date(latestEntry.entry_time);
    const currentTime = new Date();
    const totalHours = Math.ceil((currentTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60));

    // Calculate discount amount based on free hours
    let discountAmount = 0;
    const freeHours = discount.free_hours;
    
    if (freeHours > 0) {
      // Calculate how much the free hours are worth using tiered rates
      let remainingFreeHours = Math.min(freeHours, totalHours); // Limit free hours to actual hours parked
      
      // Apply tiered rates to calculate free hours value
      for (const rate of parkingRates) {
        if (remainingFreeHours <= 0) break;
        
        const hoursAtThisRate = Math.min(remainingFreeHours, rate.hours);
        discountAmount += hoursAtThisRate * rate.rate_at_hour;
        remainingFreeHours -= hoursAtThisRate;
      }
      
      // If there are still remaining free hours, apply overflow rate
      if (remainingFreeHours > 0) {
        discountAmount += remainingFreeHours * options.overflow_hour_rate;
      }
    }
    
    // Update payment with discount (without changing amount)
    latestPayment.discount = discountAmount;
    
    // Save the updated payment
    const updatedPayment = await this.paymentRepo.save(latestPayment);

    return {
      car_id: carId,
      discount_id: discountId,
      entry_time: entryTime,
      total_hours: totalHours,
      free_hours: discount.free_hours,
      discount_amount: discountAmount,
      payment_id: updatedPayment.payment_id
    };
  }

  // Helper method to calculate original amount
  private calculateOriginalAmount(
    totalHours: number,
    parkingRates: ParkingRatesConfigurationEntity[],
    options: OptionConfigurationEntity
  ): number {
    let amount = 0;
    let remainingHours = totalHours;

    // Apply tiered rates
    for (const rate of parkingRates) {
      if (remainingHours <= 0) break;
      
      const hoursAtThisRate = Math.min(remainingHours, rate.hours);
      amount += hoursAtThisRate * rate.rate_at_hour;
      remainingHours -= hoursAtThisRate;
    }

    // If there are still remaining hours, apply overflow rate
    if (remainingHours > 0) {
      amount += remainingHours * options.overflow_hour_rate;
    }

    return amount;
  }
}