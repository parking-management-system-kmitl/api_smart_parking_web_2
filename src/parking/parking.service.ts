import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Car } from "src/entities/car.entity";
import { Repository, DataSource, IsNull, Not } from "typeorm";
import { CreateEntryDto } from "./dto/create-entry.dto";
import { ParkingRecord } from "src/entities/parking-record.entity"; // Import ParkingRecord
import { Payment } from "src/entities/payment.entity";
import { OptionConfigurationEntity } from "src/entities/option-configuration.entity";
import { ParkingRatesConfigurationEntity } from "src/entities/parking-rates-configuration.entity";

@Injectable()
export class ParkingService {
  constructor(
    @InjectRepository(Car)
    private carRepository: Repository<Car>,
    @InjectRepository(ParkingRecord) // Inject ParkingRecord repository
    private parkingRecordRepository: Repository<ParkingRecord>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(OptionConfigurationEntity)
    private optionConfigRepository: Repository<OptionConfigurationEntity>,
    @InjectRepository(ParkingRatesConfigurationEntity)
    private ParkingRateConfigRepository: Repository<ParkingRatesConfigurationEntity>,
    private dataSource: DataSource
  ) {}







  private async getConfiguration() {
    const config = await this.optionConfigRepository.findOne({
      where: {}, // Add an empty where clause to avoid the error
      order: { parking_option_id: 'DESC' }, // Get the most recent configuration
    });
  

    if (!config) {
      // Fallback to default values if no configuration found
      return {
        minuteRoundingThreshold: 30, // Default 30 minutes
        exitBufferTime: 15, // Default 15 minutes
        overflowHourRate: 20 // Default 20 baht
      };
    }

    return {
      minuteRoundingThreshold: config.minute_rounding_threshold,
      exitBufferTime: config.exit_buffer_time,
      overflowHourRate: config.overflow_hour_rate
    };
  }

  private async getParkingRates(): Promise<{ hours: number; rate_at_hour: number; }[]> {
    const rates = await this.ParkingRateConfigRepository.find({
      order: { hours: 'ASC' } // Order by hours
    });
    return rates.map(rate => ({ 
      hours: rate.hours, 
      rate_at_hour: rate.rate_at_hour 
    }));
  }


  private calculateParkingFee(parkedHours: number, rates: { hours: number, rate_at_hour: number }[], overflowHourRate: number): number {
    let fee = 0;
    let remainingHours = parkedHours;
  
    for (let i = 0; i < rates.length; i++) {
      const rate = rates[i];
      const startHour = i > 0 ? rates[i - 1].hours : 0;
      const duration = rate.hours - startHour;
  
      if (remainingHours <= 0) break;
  
      // Skip free hours
      if (rate.rate_at_hour === 0) {
        remainingHours -= duration;
        continue;
      }
  
      if (remainingHours <= duration) {
        fee += remainingHours * rate.rate_at_hour;
        remainingHours = 0;
      } else {
        fee += duration * rate.rate_at_hour;
        remainingHours -= duration;
      }
    }
  
    if (remainingHours > 0) {
      fee += remainingHours * overflowHourRate;
    }
  
    return fee;
  }

  async createEntry(createEntryDto: CreateEntryDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Find or create car
      let car = await this.carRepository.findOne({
        where: { license_plate: createEntryDto.licensePlate }
      });

      if (!car) {
        car = this.carRepository.create({
          license_plate: createEntryDto.licensePlate
        });
        await queryRunner.manager.save(car);
      }

      // 2. Create parking record (instead of entry record)
      const parkingRecord = this.parkingRecordRepository.create({
        car_id: car.car_id,
        entry_time: new Date(),
        entry_car_image_path: createEntryDto.imagePath
      });
      await queryRunner.manager.save(parkingRecord);

      // 3. Create initial payment with null paid_at
      const initialPayment = this.paymentRepository.create({
        parking_record_id: parkingRecord.parking_record_id, // Use parking_record_id
        amount: 0,
        discount: 0,
        paid_at: null
      });
      await queryRunner.manager.save(initialPayment);

      await queryRunner.commitTransaction();

      return {
        carId: car.car_id,
        parkingRecordId: parkingRecord.parking_record_id, // Return parkingRecordId
        paymentId: initialPayment.payment_id
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }


  async findCarByLicensePlate(licensePlate: string) {
    const car = await this.carRepository.findOne({
      where: { license_plate: licensePlate },
      relations: ['member'] // ถ้าต้องการดึงข้อมูล member ด้วย
    });

    if (!car) {
      throw new NotFoundException(`ไม่พบรถทะเบียน ${licensePlate}`);
    }

    return car;
  }

  async getLatestEntry(licensePlate: string) {
    const parkingRecord = await this.parkingRecordRepository // Use parkingRecordRepository
    .createQueryBuilder('parkingRecord')
    .innerJoin('parkingRecord.car', 'car')
    .where('car.license_plate =:licensePlate', { licensePlate })
    .orderBy('parkingRecord.entry_time', 'DESC')
    .getOne();

    if (!parkingRecord) {
      throw new NotFoundException(`ไม่พบประวัติการเข้าของรถทะเบียน ${licensePlate}`);
    }

    return parkingRecord; // Return ParkingRecord instead of EntryRecord
  }

  async getEntryRecords(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const currentTime = new Date();
    const config = await this.getConfiguration();
    const rates = await this.getParkingRates();
  
    const [records, total] = await this.parkingRecordRepository.findAndCount({ // Use parkingRecordRepository
      where: { exit_time: IsNull() }, // Filter for active records
      relations: {
        car: true,
        payments: true,
      },
      order: { entry_time: 'DESC' },
      skip,
      take: limit,
    });
  
    //... (rest of the code remains the same)
  
  
    const processedRecords = records.map(record => {
      const parkedTimeMs = currentTime.getTime() - record.entry_time.getTime();
      const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
      const parkingFee = this.calculateParkingFee(parkedHours, rates, config.overflowHourRate); // Use calculateParkingFee
  
  
      // ตรวจสอบสถานะ VIP
      const isVip = record.car?.vip_expiry_date 
        ? new Date(record.car.vip_expiry_date) > currentTime 
        : false;
  
      return {
        ...record,
        parkedHours,
        parkingFee,
        isVip,
        car: {
          ...record.car,
          isVip
        }
      };
    });
  
    return {
      data: processedRecords,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
  
  async getEntryExitRecords(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const currentTime = new Date();
    const config = await this.getConfiguration();
    const rates = await this.getParkingRates();
  
    const [records, total] = await this.parkingRecordRepository.findAndCount({ // Use parkingRecordRepository
      where: { exit_time: Not(IsNull()) }, // Filter for completed records
      relations: {
        car: true,
        payments: true
      },
      order: { entry_time: 'DESC' },
      skip,
      take: limit,
    });
  
    // แปลงข้อมูลพร้อมคำนวณค่าบริการและสถานะ VIP
    const processedRecords = records.map(record => {
      const parkedTimeMs = record.exit_time.getTime() - record.entry_time.getTime();
      const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
      const parkingFee = this.calculateParkingFee(parkedHours, rates, config.overflowHourRate); // Use calculateParkingFee
  
  
      // ตรวจสอบสถานะ VIP
      const isVip = record.car?.vip_expiry_date 
        ? new Date(record.car.vip_expiry_date) > currentTime 
        : false;
  
      return {
        ...record,
        parkedHours,
        parkingFee,
        isVip,
        car: {
          ...record.car,
          isVip
        }
      };
    });
  
    return {
      data: processedRecords,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getAllParkingRecords(
    page: number = 1,
    limit: number = 10,
    sortBy: 'entry_time' | 'exit_time' = 'entry_time',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ) {
    // Get configuration
    const config = await this.getConfiguration();
    const rates = await this.getParkingRates(); // Fetch parking rates
  
    const skip = (page - 1) * limit;
    const currentTime = new Date();
  
    // Fetch active entries (entry records)
    const [activeEntries, activeTotal] = await this.parkingRecordRepository.findAndCount({
      where: { exit_time: IsNull() },
      order: {
        entry_time: sortOrder === 'DESC'? 'DESC': 'ASC',
      },
      skip,
      take: limit,
    });
  
    // Fetch completed entries (entry-exit records)
    const [completedEntries, completedTotal] = await this.parkingRecordRepository.findAndCount({
      where: { exit_time: Not(IsNull()) },
      order: {
        exit_time: sortOrder === 'DESC'? 'DESC': 'ASC',
      },
      skip,
      take: limit,
    });
  
    // Process active entries
    const processedActiveEntries = activeEntries.map(entry => {
      const parkedTimeMs = currentTime.getTime() - entry.entry_time.getTime();
      const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
      const parkingFee = this.calculateParkingFee(parkedHours, rates, config.overflowHourRate); // Use calculateParkingFee
  
      return {
        entry_records_id: entry.parking_record_id,
        car_id: entry.car_id,
        type: 'active',
        entry_time: entry.entry_time,
        exit_time: null,
        entry_car_image_path: entry.entry_car_image_path,
        car: {
          car_id: entry.car.car_id,
          license_plate: entry.car.license_plate,
          vip_expiry_date: entry.car.vip_expiry_date,
          member_id: entry.car.member?.member_id,
        },
        parked_hours: parkedHours,
        parking_fee: parkingFee,
        payments: entry.payments.map(payment => ({
          payment_id: payment.payment_id,
          entry_record_id: payment.parking_record_id,
          amount: payment.amount,
          discount: payment.discount,
          paid_at: payment.paid_at,
        })),
      };
    });
  
    // Process completed entries
    const processedCompletedEntries = completedEntries.map(entry => {
      const parkedTimeMs = entry.exit_time.getTime() - entry.entry_time.getTime();
      const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
      const parkingFee = this.calculateParkingFee(parkedHours, rates, config.overflowHourRate); // Use calculateParkingFee
  
      return {
        entry_exit_records_id: entry.parking_record_id,
        car_id: entry.car_id,
        type: 'completed',
        entry_time: entry.entry_time,
        exit_time: entry.exit_time,
        entry_car_image_path: entry.entry_car_image_path,
        car: {
          car_id: entry.car.car_id,
          license_plate: entry.car.license_plate,
          vip_expiry_date: entry.car.vip_expiry_date,
          member_id: entry.car.member?.member_id,
        },
        parked_hours: parkedHours,
        parking_fee: parkingFee,
        payments: entry.payments.map(payment => ({
          payment_id: payment.payment_id,
          entry_exit_record_id: payment.parking_record_id,
          amount: payment.amount,
          discount: payment.discount,
          paid_at: payment.paid_at,
        })),
      };
    });
  
    // Combine and sort entries
    const allEntries = [...processedActiveEntries, ...processedCompletedEntries]
      .sort((a, b) => {
        const timeA = sortBy === 'entry_time' ? a.entry_time : a.exit_time || a.entry_time;
        const timeB = sortBy === 'entry_time' ? b.entry_time : b.exit_time || b.entry_time;
        return sortOrder === 'DESC' 
          ? timeB.getTime() - timeA.getTime() 
          : timeA.getTime() - timeB.getTime();
      });
  
    return {
      data: allEntries,
      pagination: {
        current_page: page,
        page_size: limit,
        total_active_entries: activeTotal,
        total_completed_entries: completedTotal,
        total_entries: activeTotal + completedTotal
      }
    };
  }

  private calculateRoundedHours(parkedTimeMs: number, minuteRoundingThreshold: number): number {
    const hours = parkedTimeMs / (1000 * 60 * 60);
    const integerHours = Math.floor(hours);
    const remainingMinutes = (hours - integerHours) * 60;

    // Round up if remaining minutes are above the threshold
    return remainingMinutes > minuteRoundingThreshold? integerHours + 1: integerHours;
  }


  ///////////////////////////// PAYMENT //////////

  private async getLatestEntryAndCar(licensePlate: string) {
    const car = await this.carRepository.findOne({
      where: { license_plate: licensePlate }
    });

    if (!car) {
      throw new NotFoundException(`ไม่พบรถทะเบียน ${licensePlate}`);
    }

    const latestEntry = await this.parkingRecordRepository // Use parkingRecordRepository
    .createQueryBuilder('parkingRecord')
    .leftJoinAndSelect('parkingRecord.payments', 'payments')
    .where('parkingRecord.car_id =:carId', { carId: car.car_id })
    .orderBy('parkingRecord.entry_time', 'DESC')
    .getOne();

    if (!latestEntry) {
      throw new NotFoundException(`ไม่พบประวัติการเข้าของรถทะเบียน ${licensePlate}`);
    }

    return { car, latestEntry };
  }

  async mockPayment(licensePlate: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const { latestEntry } = await this.getLatestEntryAndCar(licensePlate);
  
      // Find the unpaid payment with its discount
      const unpaidPayment = await this.paymentRepository.findOne({
        where: {
          parking_record_id: latestEntry.parking_record_id, // Use parking_record_id
          amount: 0,
          paid_at: IsNull(),
        },
      });
  
      if (!unpaidPayment) {
        throw new NotFoundException(`ไม่พบรายการค้างชำระของรถทะเบียน ${licensePlate}`);
      }
  
      const currentTime = new Date();
      
      // Find the latest paid payment to get continued hours
      const lastPaidPayment = await this.paymentRepository.findOne({
        where: {
          parking_record_id: latestEntry.parking_record_id, // Use parking_record_id
          paid_at: Not(IsNull()),
        },
        order: { paid_at: 'DESC' },
      });

      // Get configuration and parking rates
      const config = await this.getConfiguration();
      const rates = await this.getParkingRates();

      let startTime = latestEntry.entry_time;
      let previouslyPaidHours = 0;

      if (lastPaidPayment) {
        const validUntil = new Date(lastPaidPayment.paid_at);
        validUntil.setMinutes(validUntil.getMinutes() + config.exitBufferTime);
        previouslyPaidHours = Math.ceil(
          (validUntil.getTime() - latestEntry.entry_time.getTime()) / (1000 * 60 * 60)
        );
        startTime = validUntil;
      }

      // Find the next rate after previously paid hours
      const nextRateIndex = rates.findIndex(rate => rate.hours > previouslyPaidHours);
      let originalAmount = 0;
      
      if (nextRateIndex !== -1) {
        originalAmount = rates[nextRateIndex].rate_at_hour;
      } else {
        // If no next rate found, use overflow rate
        originalAmount = config.overflowHourRate;
      }

      // Calculate amount after discount
      let amountAfterDiscount = Math.max(0, originalAmount - unpaidPayment.discount);

      // Debug logs
      console.log('Original Amount:', originalAmount);
      console.log('Discount:', unpaidPayment.discount);
      console.log('Amount After Discount:', amountAfterDiscount);

      // Update the payment record with amount after discount
      await this.paymentRepository
        .createQueryBuilder()
        .update(Payment)
        .set({
          amount: amountAfterDiscount, // บันทึกยอดหลังหักส่วนลด
          paid_at: currentTime,
        })
        .where('payment_id = :id', { id: unpaidPayment.payment_id })
        .execute();
  
      await queryRunner.commitTransaction();
  
      // Fetch the updated payment record
      const updatedPayment = await this.paymentRepository.findOne({
        where: { payment_id: unpaidPayment.payment_id },
      });
  
      return {
        paymentId: updatedPayment.payment_id,
        licensePlate,
        originalAmount,              // ยอดก่อนหักส่วนลด
        discount: updatedPayment.discount,
        amount: updatedPayment.amount, // ยอดหลังหักส่วนลด
        paidAt: updatedPayment.paid_at,
        entryTime: latestEntry.entry_time,
        startTime,
        previouslyPaidHours,
        continuedFromHour: previouslyPaidHours,
        nextHourRate: originalAmount
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
}

async recordCarExit(licensePlate: string) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ดึงข้อมูลโดยใช้ relations
    const { car, latestEntry } = await this.getLatestEntryAndCar(licensePlate);

    // Check if any payment is needed
    const paymentStatus = await this.checkPaymentAmount(licensePlate);
    if (paymentStatus.needNewPayment && paymentStatus.newPaymentDetails.amountAfterDiscount > 0) {
      throw new BadRequestException('ไม่สามารถออกได้: ต้องชำระค่าจอดรถเพิ่ม');
    }

    // Check for unpaid payments
    const hasUnpaidPayments = latestEntry.payments.some(p => p.paid_at === null);
    if (hasUnpaidPayments) {
      throw new BadRequestException('ไม่สามารถออกได้: มีรายการที่ยังไม่ได้ชำระ');
    }

    // **อัพเดต exit_time ใน ParkingRecord**
    latestEntry.exit_time = new Date(); 
    await queryRunner.manager.save(latestEntry); 

    await queryRunner.commitTransaction();

    // Load payments for response
    const savedEntryExit = await this.parkingRecordRepository.findOne({
      where: { parking_record_id: latestEntry.parking_record_id },
      relations: ['payments']
    });

    return {
      success: true,
      licensePlate,
      parkingRecordId: savedEntryExit.parking_record_id, // แก้ไขเป็น parkingRecordId
      entryTime: savedEntryExit.entry_time,
      exitTime: savedEntryExit.exit_time,
      payments: savedEntryExit.payments.map(p => ({
        paymentId: p.payment_id,
        amount: p.amount,
        paidAt: p.paid_at
      }))
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

  async getPaymentHistory(licensePlate: string) {
    // ค้นหารถ
    const car = await this.carRepository.findOne({
      where: { license_plate: licensePlate }
    });

    if (!car) {
      throw new NotFoundException(`ไม่พบรถทะเบียน ${licensePlate}`);
    }

    // ดึงข้อมูลการเข้าจอดที่ยังไม่ได้ออก พร้อม payments
    const activeEntries = await this.parkingRecordRepository.find({
      where: { 
        car_id: car.car_id,
        exit_time: IsNull()  // เพิ่มเงื่อนไขนี้เพื่อดึงเฉพาะ active entries
      },
      relations: ['payments'],
      order: { entry_time: 'DESC' }
    });

    // ดึงข้อมูลการเข้า-ออกที่สมบูรณ์แล้ว พร้อม payments
    const completedEntries = await this.parkingRecordRepository.find({
      where: { 
        car_id: car.car_id,
        exit_time: Not(IsNull())  // เพิ่มเงื่อนไขนี้เพื่อดึงเฉพาะ completed entries
      },
      relations: ['payments'],
      order: { exit_time: 'DESC' }
    });

    // แปลงข้อมูลสำหรับ response
    const processActiveEntries = activeEntries.map(entry => ({
      type: 'active',
      entryTime: entry.entry_time,
      exitTime: null,
      payments: entry.payments
        .sort((a, b) => (b.paid_at?.getTime() || 0) - (a.paid_at?.getTime() || 0))
        .map(payment => ({
          paymentId: payment.payment_id,
          amount: payment.amount,
          discount: payment.discount,
          paidAt: payment.paid_at
        }))
    }));

    const processCompletedEntries = completedEntries.map(entry => ({
      type: 'completed',
      entryTime: entry.entry_time,
      exitTime: entry.exit_time,
      payments: entry.payments
        .sort((a, b) => (b.paid_at?.getTime() || 0) - (a.paid_at?.getTime() || 0))
        .map(payment => ({
          paymentId: payment.payment_id,
          amount: payment.amount,
          discount: payment.discount,
          paidAt: payment.paid_at
        }))
    }));

    // คำนวณสรุปข้อมูล
    const allPayments = [...activeEntries, ...completedEntries]
      .flatMap(entry => entry.payments);

    const totalAmount = allPayments
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    return {
      licensePlate,
      activeRecords: processActiveEntries,
      completedRecords: processCompletedEntries,
      summary: {
        totalEntries: activeEntries.length + completedEntries.length,
        totalPayments: allPayments.length,
        totalAmount: totalAmount
      }
    };
  }

  // src/parking/parking.service.ts - แก้ไขส่วน checkPaymentAmount

  async checkPaymentAmount(licensePlate: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { latestEntry } = await this.getLatestEntryAndCar(licensePlate);
        const currentTime = new Date();
        let startTime = latestEntry.entry_time;
        let needNewPayment = true;

        // Get configuration and parking rates
        const config = await this.getConfiguration();
        const rates = await this.getParkingRates();

        // Find the latest paid payment
        const lastPaidPayment = await this.paymentRepository.findOne({
          where: {
            parking_record_id: latestEntry.parking_record_id, // Use parking_record_id
                paid_at: Not(IsNull()),
            },
            order: { paid_at: 'DESC' },
        });

        // Find any unpaid payment record to get discount
        const unPaidPayment = await this.paymentRepository.findOne({
          where: {
            parking_record_id: latestEntry.parking_record_id, // Use parking_record_id
                paid_at: IsNull(),
            },
        });

        let validUntil = null;
        let previouslyPaidHours = 0;

        // Check if the last payment is still valid
        if (lastPaidPayment) {
            const paidAtMs = new Date(lastPaidPayment.paid_at).getTime();
            const validUntilMs = paidAtMs + (config.exitBufferTime * 60 * 1000);
            validUntil = new Date(validUntilMs);

            // Calculate previously paid hours
            previouslyPaidHours = Math.ceil(
                (validUntil.getTime() - latestEntry.entry_time.getTime()) / (1000 * 60 * 60)
            );

            if (currentTime.getTime() <= validUntilMs) {
                startTime = new Date(lastPaidPayment.paid_at);
                needNewPayment = false;
            } else {
                startTime = validUntil;
                needNewPayment = true;
            }
        }

        let parkedHours = 0;
        let amount = 0;
        let amountAfterDiscount = 0;
        const currentDiscount = unPaidPayment?.discount || 0;

        if (needNewPayment) {
            // Force round up to 1 hour when new payment is needed
            parkedHours = 1;

            // Find the next rate after previously paid hours
            const nextRateIndex = rates.findIndex(rate => rate.hours > previouslyPaidHours);
            
            if (nextRateIndex !== -1) {
                amount = rates[nextRateIndex].rate_at_hour;
            } else {
                // If no next rate found, use overflow rate
                amount = config.overflowHourRate;
            }

            // Calculate amount after discount
            amountAfterDiscount = amount - currentDiscount;
            amountAfterDiscount = amountAfterDiscount < 0 ? 0 : amountAfterDiscount;
        }

        // Create a new initial payment record if needed
        if (needNewPayment &&!unPaidPayment) {
          const newInitialPayment = this.paymentRepository.create({
            parking_record_id: latestEntry.parking_record_id, // Use parking_record_id
                amount: 0,
                discount: currentDiscount,
                paid_at: null,
            });
            await queryRunner.manager.save(newInitialPayment);
        }

        await queryRunner.commitTransaction();

        // Debug logs
        console.log('Previous Paid Hours:', previouslyPaidHours);
        console.log('Parked Hours:', parkedHours);
        console.log('Amount Before Discount:', amount);
        console.log('Current Discount:', currentDiscount);
        console.log('Amount After Discount:', amountAfterDiscount);

        const response = {
            licensePlate,
            entryTime: latestEntry.entry_time,
            lastPayment: lastPaidPayment
                ? {
                    paymentId: lastPaidPayment.payment_id,
                    amount: lastPaidPayment.amount,
                    paidAt: lastPaidPayment.paid_at,
                    validUntil,
                    paidHours: previouslyPaidHours
                }
                : null,
            currentTime,
            needNewPayment,
            newPaymentDetails: needNewPayment
                ? {
                    startTime,
                    parkedHours,
                    originalAmount: amount,
                    discount: currentDiscount,
                    amountAfterDiscount,
                    roundingThreshold: config.minuteRoundingThreshold,
                    continuedFromHour: previouslyPaidHours,
                    nextHourRate: amount
                }
                : null,
        };

        console.log('Response:', JSON.stringify(response, null, 2));
        return response;

    } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }

}


// Helper function to calculate remaining minutes
private calculateRemainingMinutes(parkedTimeMs: number, roundingThreshold: number): number {
    const totalMinutes = Math.floor(parkedTimeMs / (1000 * 60));
    const roundedMinutes = Math.floor(totalMinutes / 60) * 60; // Minutes before rounding
    const remainingMs = parkedTimeMs - (roundedMinutes * 60 * 1000);
    const remainingMinutes = Math.floor(remainingMs / (1000 * 60));
    return remainingMinutes;

}
}