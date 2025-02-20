import { BadRequestException, Body, Injectable, NotFoundException, Param, ParseIntPipe, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, IsNull, Not } from 'typeorm';
import { Car } from '../entities/car.entity';
import { Member } from 'src/entities/member.entity';
import { UpdateCarDto } from './dto/update-car.dto';


interface UpdateVipDto {
    vip_days?: number;
    f_name?: string;
    l_name?: string;
    phone?: string;
  }

@Injectable()
export class Vip {
  constructor(
    @InjectRepository(Car)
    private carRepository: Repository<Car>,
    @InjectRepository(Member)
    private memberRepository: Repository<Member>,
  ) {}

  async getActiveVipCars(page: number = 1, limit: number = 10): Promise<{ data: any[]; total: number }> { // Changed type of data to any[]
    const currentDate = new Date();
    const skip = (page - 1) * limit;

    const [cars, total] = await this.carRepository.findAndCount({ // Renamed data to cars for clarity
      where: {
        vip_expiry_date: Not(IsNull()),
      },
      relations: ['member'],
      skip,
      take: limit,
    });


    const data = cars.map((car) => { // Now map AFTER TypeORM population
      return {
        ...car,
        member: car.member ? { // Handle potential null member
            member_id: car.member.member_id,
            f_name: car.member.f_name,
            l_name: car.member.l_name,
            phone: car.member.phone,
        } : null, // or undefined, depending on your needs.
      };
    });

    return { data, total };
  }


  async updateVip(carId: number, data: UpdateVipDto) {
    // Find the car by ID, including the member relation
    const car = await this.carRepository.findOne({
      where: { car_id: carId },
      relations: ['member'],
    });

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    // Update VIP expiry date if vip_days is provided
    if (data.vip_days) {
      const today = new Date();
      car.vip_expiry_date = new Date(today.getTime() + (data.vip_days * 24 * 60 * 60 * 1000));
    }

    // Update car properties
    await this.carRepository.save(car);

    // Update member properties if provided
    if (car.member && (data.f_name || data.l_name || data.phone)) {
      if (data.f_name) {
        car.member.f_name = data.f_name;
      }
      if (data.l_name) {
        car.member.l_name = data.l_name;
      }
      if (data.phone) {
        car.member.phone = data.phone;
      }

      // Save the updated member
      await this.memberRepository.save(car.member);
    }

    // Return the updated car data
    return {
    ...car,
      member: car.member? {
        member_id: car.member.member_id,
        f_name: car.member.f_name,
        l_name: car.member.l_name,
        phone: car.member.phone,
      }: null,
    };
  }

  async updateLicensePlate(carId: number, newLicensePlate: string): Promise<Car> {
    const car = await this.carRepository.findOne({ where: { car_id: carId } });

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    // Check if the new license plate is already in use by another car
    const existingCar = await this.carRepository.findOne({
      where: { license_plate: newLicensePlate },
    });

    if (existingCar && existingCar.car_id !== carId) {
      throw new BadRequestException('License plate is already in use');
    }

    // Update the car's license plate
    car.license_plate = newLicensePlate;
    await this.carRepository.save(car);

    return car;
  }


  async cancelVip(carId: number): Promise<Car> {
    const car = await this.carRepository.findOne({ where: { car_id: carId } });

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    // Set the vip_expiry_date to the current date and time
    car.vip_expiry_date = null; 
    await this.carRepository.save(car);

    return car; 
  }

}