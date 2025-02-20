import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Member } from '../entities/member.entity';
import { Car } from '../entities/car.entity';
import { LinkCarDto } from './dto/link-car.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { VipPromotion } from 'src/entities/vip-promotions';

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(Member)
    private memberRepository: Repository<Member>,
    @InjectRepository(Car)
    private carRepository: Repository<Car>, 
    
    @InjectRepository(VipPromotion)
    private vipRepository: Repository<VipPromotion>,
  ) {}

  // Register a new member
  async registerMember(memberData: CreateMemberDto) {
    // Check if member with this phone number already exists
    const existingMember = await this.memberRepository.findOne({
      where: { phone: memberData.phone }
    });
  
    if (existingMember) {
      return {
        status: false,
        message: 'Phone number is already in use',
        member_id: existingMember.member_id
      };
    }
  
    // Create new member
    const newMember = this.memberRepository.create({
      f_name: memberData.f_name,
      l_name: memberData.l_name,
      phone: memberData.phone
    });
  
    // Save the new member
    const savedMember = await this.memberRepository.save(newMember);
  
    return {
      status: true,
      message: 'Member registered successfully',
      member_id: savedMember.member_id
    };
  }

  // Check phone number and get associated cars
  async checkPhoneNumber(phone: string) {

    if (!phone) {
        throw new BadRequestException('phone number is required');
      }
    // Find member by phone
    const member = await this.memberRepository.findOne({
      where: { phone }
    });

    if (member) {
      // Find all cars for this member
      const existingCars = await this.carRepository.find({
        where: { member: { member_id: member.member_id } }
      });

      // Transform car details with expiry information
      const carDetails = existingCars.map(car => {
        const today = new Date();
        const isExpired = car.vip_expiry_date ? car.vip_expiry_date < today : false;
        const daysRemaining = car.vip_expiry_date 
          ? Math.ceil((car.vip_expiry_date.getTime() - today.getTime()) / (1000 * 3600 * 24)) 
          : null;

        return {
          car_id: car.car_id,
          license_plate: car.license_plate,
          vip_expiry_date: car.vip_expiry_date,
          days_remaining: daysRemaining,
          is_expired: isExpired
        };
      });

      // Sort cars: non-expired with least remaining days first, then expired cars
      const sortedCars = carDetails.sort((a, b) => {
        if (a.is_expired && !b.is_expired) return 1;
        if (!a.is_expired && b.is_expired) return -1;
        
        // For non-expired cars, sort by days remaining
        if (!a.is_expired && !b.is_expired) {
          return (a.days_remaining || Infinity) - (b.days_remaining || Infinity);
        }
        return 0;
      });

      return {
        exists: true,
        member_id: member.member_id,
        cars: sortedCars
      };
    }

    return { 
      exists: false 
    };
  }

  async linkCarToMember(data: LinkCarDto) {
    if (!data.phone) {
      throw new BadRequestException('phone number is required');
    }
  
    if (!data.licenseplate) {
      throw new BadRequestException('licenseplate is required');
    }
  
    if (!data.vip_days) {
      throw new BadRequestException('vip_days is required');
    }
  
    const member = await this.memberRepository.findOne({
      where: { phone: data.phone }
    });
  
    if (!member) {
      throw new NotFoundException('Member with this phone number not found');
    }
  
    // Check if car already exists and if it's linked to a member
    const existingCar = await this.carRepository.findOne({
      where: { license_plate: data.licenseplate },
      relations: ['member']
    });
  
    if (existingCar && existingCar.member) {
      throw new ConflictException('Car is already registered to another member');
    }
  
    const today = new Date();
    const vipExpiryDate = data.vip_days
      ? new Date(today.getTime() + (data.vip_days * 24 * 60 * 60 * 1000))
      : null;
  
    let carToSave;
    
    if (existingCar) {
      // Update existing car if it exists but has no owner
      existingCar.member = member;
      existingCar.vip_expiry_date = vipExpiryDate;
      carToSave = existingCar;
    } else {
      // Create new car if it doesn't exist
      carToSave = this.carRepository.create({
        license_plate: data.licenseplate,
        vip_expiry_date: vipExpiryDate,
        member: member,
      });
    }
  
    await this.carRepository.save(carToSave);
  
    // Fetch cars using the relation for efficiency
    const existingCars = await this.carRepository.find({
      where: { member: { member_id: member.member_id } },
    });
  
    const carDetails = existingCars.map(car => {
      const isExpired = car.vip_expiry_date ? car.vip_expiry_date < today : false;
      const daysRemaining = car.vip_expiry_date
        ? Math.ceil((car.vip_expiry_date.getTime() - today.getTime()) / (1000 * 3600 * 24))
        : null;
  
      return {
        car_id: car.car_id,
        license_plate: car.license_plate,
        vip_expiry_date: car.vip_expiry_date,
        days_remaining: daysRemaining,
        is_expired: isExpired
      };
    });
  
    const sortedCars = carDetails.sort((a, b) => {
      if (a.is_expired && !b.is_expired) return 1;
      if (!a.is_expired && b.is_expired) return -1;
  
      if (!a.is_expired && !b.is_expired) {
        return (a.days_remaining || Infinity) - (b.days_remaining || Infinity);
      }
  
      return 0;
    });
  
    return {
      message: 'Car linked successfully',
      cars: sortedCars
    };
  }

  async unlinkCar(carId: number) {
    if (!carId) {
      throw new BadRequestException('car_id is required');
    }
  
    // Find the car by ID
    const car = await this.carRepository.findOne({
      where: { car_id: carId },
      relations: ['member'] // Load the member relation
    });
  
    if (!car) {
      throw new NotFoundException(`Car with ID ${carId} not found`);
    }
  
    if (!car.member) {
      throw new BadRequestException('Car is not linked to any member');
    }
  
    // Store member_id before unlinking for the response
    const memberId = car.member.member_id;
  
    // Unlink the car from member and set VIP expiry to null
    car.member = null;
    car.vip_expiry_date = null;
  
    // Save the updated car
    await this.carRepository.save(car);
  
    return {
      success: true,
      message: 'Car unlinked successfully',
      car_id: carId,
      previous_member_id: memberId
    };
  }


  async prepareReg(data: { phone: string; licenseplate: string }) {
    // Validate input
    if (!data.phone) {
      throw new BadRequestException('phone number is required');
    }
    if (!data.licenseplate) {
      throw new BadRequestException('licenseplate is required');
    }

    // Get active VIP promotion
    const activePromotion = await this.vipRepository.findOne({
      where: { isActive: true },
      order: { vip_promotion_id: 'DESC' }
    });

    if (!activePromotion) {
      return {
        status: false,
        message: 'No active VIP promotion found',
        data: null
      };
    }

    // Check if member exists, but do not throw error if not found
    const member = await this.memberRepository.findOne({
      where: { phone: data.phone }
    });

    // If member doesn't exist, we proceed with the car registration without the member
    let message = 'New member registration not required';
    let memberId = null;

    if (member) {
      memberId = member.member_id; // Use existing member ID if member found
    } else {
      message = 'No existing member found, proceeding with new car registration';
    }

    // Check if car already exists and if it's linked to a member
    const existingCar = await this.carRepository.findOne({
      where: { license_plate: data.licenseplate },
      relations: ['member']
    });

    if (existingCar && existingCar.member) {
      throw new ConflictException('Car is already registered to another member');
    }

    const today = new Date();
    const vipExpiryDate = new Date(today.getTime() + (activePromotion.days * 24 * 60 * 60 * 1000));


    
    return {
      status: true,
      message: message,
      data: {
        promotion: {
          days: activePromotion.days,
          price: activePromotion.price
        },
        car_owner: memberId // Include member ID if it exists
      }
    };
}



}