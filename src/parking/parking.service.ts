import { BadRequestException, Body, Injectable, NotFoundException } from "@nestjs/common";

import { InjectRepository } from "@nestjs/typeorm";

import { Car } from "src/entities/car.entity";

import { Repository, DataSource, IsNull, Not, ILike, In } from "typeorm";

import { CreateEntryDto } from "./dto/create-entry.dto";

import { ParkingRecord } from "src/entities/parking-record.entity"; // Import ParkingRecord

import { Payment } from "src/entities/payment.entity";

import { OptionConfigurationEntity } from "src/entities/option-configuration.entity";

import { ParkingRatesConfigurationEntity } from "src/entities/parking-rates-configuration.entity";

import { LicensePlateSearchDto } from "./dto/license-plate-search.dto";



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

    ) { }















    private async getConfiguration() {

        const config = await this.optionConfigRepository.findOne({

            where: {}, // Add an empty where clause to avoid the error

            order: { parking_option_id: 'DESC' }, // Get the most recent configuration

        });





        if (!config) {

            // Fallback to default values if no configuration found

            return {

                minuteRoundingThreshold: 30, // Default 30 minutes

                exitBufferTime: 20, // Default 15 minutes

                overflowHourRate: 0 // Default 0 baht

            };

        }



        return {

            minuteRoundingThreshold: config.minute_rounding_threshold,

            exitBufferTime: config.exit_buffer_time,

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





    private calculateParkingFee(parkedHours: number, rates: { hours: number, rate_at_hour: number }[]): number {



        if (!rates || rates.length === 0) {

            return 0;

        }



        let fee = 0;

        let remainingHours = parkedHours;



        // Sort rates to ensure they are in ascending order

        const sortedRates = [...rates].sort((a, b) => a.hours - b.hours);



        // Iterate through the sorted rates

        for (let i = 0; i < sortedRates.length; i++) {

            if (remainingHours <= 0) break;



            const currentRate = sortedRates[i];

            const previousRate = i > 0 ? sortedRates[i - 1] : { hours: 0, rate_at_hour: 0 };



            // Determine the start and end hours for this rate

            const startHour = previousRate.hours;

            const endHour = currentRate.hours;



            // Calculate hours in this rate range

            const hoursInThisRange = Math.min(remainingHours, endHour - startHour);



            // Calculate fee using the previous rate's hour rate

            fee += hoursInThisRange * previousRate.rate_at_hour;



            // Reduce remaining hours

            remainingHours -= hoursInThisRange;

        }



        // If there are remaining hours after all defined rates

        if (remainingHours > 0) {

            // Use the last rate's hourly rate for remaining hours

            const lastRate = sortedRates[sortedRates.length - 1];

            fee += remainingHours * lastRate.rate_at_hour;

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
    
        const [records, total] = await this.parkingRecordRepository.findAndCount({
            where: { exit_time: IsNull() },
            relations: {
                car: true,
                payments: true,
            },
            order: { entry_time: 'DESC' },
            skip,
            take: limit,
        });
    
        const processedRecords = await Promise.all(records.map(async (record) => {
            let parkingFee = 0;
            let parkedHours = 0;
    
            // Find the latest payment (paid or unpaid)
            const latestPayment = record.payments.sort((a, b) => (b.payment_id - a.payment_id))[0];
    
            if (latestPayment.paid_at) {
                // ดึงค่าจอดจาก amount ใน payment
                parkingFee = latestPayment.amount;
                // คำนวณเวลาจอดจาก entry_time และ exit_time ถ้ามี
                if (record.exit_time) {
                    const parkedTimeMs = record.exit_time.getTime() - record.entry_time.getTime();
                    parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                } else {
                    const parkedTimeMs = currentTime.getTime() - record.entry_time.getTime();
                    parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                }
            } else {
                // คำนวณค่าจอดปกติ
                const parkedTimeMs = currentTime.getTime() - record.entry_time.getTime();
                parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                parkingFee = this.calculateParkingFee(parkedHours, rates);
    
                // Find applicable discount (if any)
                const discount = latestPayment ? latestPayment.discount : 0;
    
                // Calculate parking fee after discount
                parkingFee = Math.max(0, parkingFee - discount);
    
                // Update the latest payment with the calculated amount
                await this.paymentRepository.update(
                    { payment_id: latestPayment.payment_id },
                    { amount: parkingFee }
                );
            }
    
            // ตรวจสอบสถานะ VIP
            const isVip = record.car?.vip_expiry_date
                ? new Date(record.car.vip_expiry_date) > currentTime
                : false;
    
            return {
                ...record,
                parkedHours,
                parkingFee: Math.floor(parkingFee),
                isVip,
                car: {
                    ...record.car,
                    isVip,
                }
            };
        }));
    
        return {
            data: processedRecords,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }



    async getEntryExitRecords(page: number = 1, limit: number = 10) {

        const skip = (page - 1) * limit;

        const currentTime = new Date();

        const config = await this.getConfiguration();

        const rates = await this.getParkingRates();



        const [records, total] = await this.parkingRecordRepository.findAndCount({

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

      const parkingFee = record.payments.reduce((sum, p) => sum + p.amount, 0);



            // ตรวจสอบสถานะ VIP

            const isVip = record.car?.vip_expiry_date

                ? new Date(record.car.vip_expiry_date) > currentTime

                : false;



            // Find applicable discount (if any)

            const unpaidPayment = record.payments.find(p => p.paid_at === null);

            const discount = unpaidPayment ? unpaidPayment.discount : 0;



            // Calculate parking fee after discount

            const parkingFeeAfterDiscount = Math.max(0, parkingFee - 0);



            return {

                ...record,

                parkedHours,

                parkingFee: parkingFeeAfterDiscount, // Return the parking fee after discount

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
        const rates = await this.getParkingRates();
        const currentTime = new Date();
        
        // สร้าง query builder เพื่อให้สามารถ join และ order ได้ถูกต้อง
        const queryBuilder = this.parkingRecordRepository.createQueryBuilder('record')
            .leftJoinAndSelect('record.car', 'car')
            .leftJoinAndSelect('car.member', 'member')
            .leftJoinAndSelect('record.payments', 'payments');
        
        // กำหนด order by ที่ถูกต้อง
        if (sortBy === 'exit_time') {
            // ถ้าเรียงตาม exit_time ต้องจัดการกับ null values ด้วย
            if (sortOrder === 'DESC') {
                // null values จะมาล่างสุด (active entries) 
                queryBuilder.orderBy('CASE WHEN record.exit_time IS NULL THEN 0 ELSE 1 END', 'DESC')
                          .addOrderBy('record.exit_time', 'DESC');
            } else {
                // null values จะมาล่างสุด (active entries)
                queryBuilder.orderBy('CASE WHEN record.exit_time IS NULL THEN 1 ELSE 0 END', 'ASC')
                          .addOrderBy('record.exit_time', 'ASC');
            }
        } else {
            // เรียงตาม entry_time ทั้งหมด
            queryBuilder.orderBy('record.entry_time', sortOrder);
        }
        
        // นับจำนวนแต่ละประเภท (แยกนับ)
        const activeTotal = await this.parkingRecordRepository.count({ where: { exit_time: IsNull() } });
        const completedTotal = await this.parkingRecordRepository.count({ where: { exit_time: Not(IsNull()) } });
        
        // ทำ pagination
        const skip = (page - 1) * limit;
        queryBuilder.skip(skip).take(limit);
        
        // ดึงข้อมูลที่ pagination และเรียงลำดับแล้ว
        const records = await queryBuilder.getMany();
        
        // แยกประเภทและ process ข้อมูล
        const activeEntries = [];
        const completedEntries = [];
        
        // Process records
        for (const entry of records) {
            if (entry.exit_time === null) {
                // Process active entry
                let parkingFee = 0;
                let parkedHours = 0;
                
                // Find the latest payment (paid or unpaid)
                const sortedPayments = entry.payments.sort((a, b) => (b.payment_id - a.payment_id));
                const latestPayment = sortedPayments.length > 0 ? sortedPayments[0] : null;
                
                if (latestPayment && latestPayment.paid_at) {
                    // ดึงค่าจอดจาก amount ใน payment
                    parkingFee = latestPayment.amount;
                    const parkedTimeMs = currentTime.getTime() - entry.entry_time.getTime();
                    parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                } else if (latestPayment) {
                    // คำนวณค่าจอดปกติ
                    const parkedTimeMs = currentTime.getTime() - entry.entry_time.getTime();
                    parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                    parkingFee = this.calculateParkingFee(parkedHours, rates);
                    // Find applicable discount (if any)
                    const discount = latestPayment ? latestPayment.discount : 0;
                    // Calculate parking fee after discount
                    parkingFee = Math.max(0, parkingFee - discount);
                    
                    // Update the latest payment with the calculated amount
                    await this.paymentRepository.update(
                        { payment_id: latestPayment.payment_id },
                        { amount: parkingFee }
                    );
                } else {
                    // ไม่มี payment
                    const parkedTimeMs = currentTime.getTime() - entry.entry_time.getTime();
                    parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                    parkingFee = this.calculateParkingFee(parkedHours, rates);
                }
                
                const isVip = entry.car?.vip_expiry_date
                    ? new Date(entry.car.vip_expiry_date) > currentTime
                    : false;
                
                activeEntries.push({
                    entry_records_id: entry.parking_record_id,
                    car_id: entry.car_id,
                    type: 'active',
                    entry_time: entry.entry_time,
                    exit_time: null,
                    entry_car_image_path: entry.entry_car_image_path,
                    car: entry.car ? {
                        car_id: entry.car.car_id,
                        license_plate: entry.car.license_plate,
                        vip_expiry_date: entry.car.vip_expiry_date,
                        member_id: entry.car.member?.member_id,
                        isVip,
                    } : null,
                    parked_hours: parkedHours,
                    parking_fee: Math.floor(parkingFee),
                    payments: entry.payments ? entry.payments.map(payment => ({
                        payment_id: payment.payment_id,
                        entry_record_id: payment.parking_record_id,
                        amount: payment.amount,
                        discount: payment.discount,
                        paid_at: payment.paid_at,
                    })) :[],
                });
            } else {
                // Process completed entry
                const parkedTimeMs = entry.exit_time.getTime() - entry.entry_time.getTime();
                const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                const parkingFee = entry.payments.reduce((sum, p) => sum + p.amount, 0);
                const isVip = entry.car?.vip_expiry_date
                    ? new Date(entry.car.vip_expiry_date) > currentTime
                    : false;
                
                completedEntries.push({
                    entry_exit_records_id: entry.parking_record_id,
                    car_id: entry.car_id,
                    type: 'completed',
                    entry_time: entry.entry_time,
                    exit_time: entry.exit_time,
                    entry_car_image_path: entry.entry_car_image_path,
                    car: entry.car ? {
                        car_id: entry.car.car_id,
                        license_plate: entry.car.license_plate,
                        vip_expiry_date: entry.car.vip_expiry_date,
                        member_id: entry.car.member?.member_id,
                        isVip,
                    } : null,
                    parked_hours: parkedHours,
                    parking_fee: Math.max(0, parkingFee - 0),
                    payments: entry.payments ? entry.payments.map(payment => ({
                        payment_id: payment.payment_id,
                        entry_exit_record_id: payment.parking_record_id,
                        amount: payment.amount,
                        discount: payment.discount,
                        paid_at: payment.paid_at,
                    })) : [],
                });
            }
        }
        
        // รวมข้อมูลทั้งหมด - ไม่ต้องเรียงลำดับอีกเพราะได้เรียงใน query แล้ว
        const allEntries = [...activeEntries, ...completedEntries];
        
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





    // เพิ่มเมธอดใหม่สำหรับการค้นหา Entry Records ด้วยป้ายทะเบียน

    async searchEntryRecordsByLicensePlate(@Body() searchDto: LicensePlateSearchDto) {
        const { licensePlate, page = 1, limit = 10 } = searchDto;
        const skip = (page - 1) * limit;
        const currentTime = new Date();
        const config = await this.getConfiguration();
        const rates = await this.getParkingRates();
    
        // หารถด้วยเงื่อนไข like สำหรับป้ายทะเบียน
        const carsWithSimilarLicensePlate = await this.carRepository.find({
            where: { license_plate: ILike(`%${licensePlate}%`) }
        });
    
        // ดึง car_id ออกมาเป็น array
        const carIds = carsWithSimilarLicensePlate.map(car => car.car_id);
    
        // ถ้าไม่พบรถที่มีป้ายทะเบียนคล้ายกัน ให้คืนค่าเป็น array ว่าง
        if (carIds.length === 0) {
            return {
                data: [],
                total: 0,
                page,
                limit,
                totalPages: 0
            };
        }
    
        // ค้นหา Entry Records ที่มี car_id อยู่ในรายการรถที่พบ
        const [records, total] = await this.parkingRecordRepository.findAndCount({
            where: {
                car_id: In(carIds),
                exit_time: IsNull() // กรองเฉพาะรายการที่ยังไม่ออก
            },
            relations: {
                car: true,
                payments: true,
            },
            order: { entry_time: 'DESC' },
            skip,
            take: limit,
        });
    
        const processedRecords = await Promise.all(records.map(async (record) => {
            const parkedTimeMs = currentTime.getTime() - record.entry_time.getTime();
            const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
            let parkingFee = this.calculateParkingFee(parkedHours, rates);
    
            // ตรวจสอบสถานะ VIP
            const isVip = record.car?.vip_expiry_date
                ? new Date(record.car.vip_expiry_date) > currentTime
                : false;
    
            // Find the latest payment (paid or unpaid)
            const latestPayment = record.payments.sort((a, b) => (b.payment_id - a.payment_id))[0];
    
            if (latestPayment && !latestPayment.paid_at) {
                const discount = latestPayment.discount || 0;
                parkingFee = Math.max(0, parkingFee - discount);
    
                // Update the latest payment with the calculated amount
                await this.paymentRepository.update(
                    { payment_id: latestPayment.payment_id },
                    { amount: parkingFee }
                );
            } else if (latestPayment && latestPayment.paid_at) {
              parkingFee = latestPayment.amount
            }
    
            return {
                ...record,
                parkedHours,
                parkingFee: Math.floor(parkingFee),
                isVip,
                car: {
                    ...record.car,
                    isVip
                }
            };
        }));
    
        return {
            data: processedRecords,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }



    // เพิ่มเมธอดใหม่สำหรับการค้นหา Entry-Exit Records ด้วยป้ายทะเบียน

    async searchEntryExitRecordsByLicensePlate(@Body() searchDto: LicensePlateSearchDto) {

        const { licensePlate, page = 1, limit = 10 } = searchDto;

        const skip = (page - 1) * limit;

        const currentTime = new Date();

        const config = await this.getConfiguration();

        const rates = await this.getParkingRates();



        // หารถด้วยเงื่อนไข like สำหรับป้ายทะเบียน

        const carsWithSimilarLicensePlate = await this.carRepository.find({

            where: { license_plate: ILike(`%${licensePlate}%`) }

        });



        // ดึง car_id ออกมาเป็น array

        const carIds = carsWithSimilarLicensePlate.map(car => car.car_id);



        // ถ้าไม่พบรถที่มีป้ายทะเบียนคล้ายกัน ให้คืนค่าเป็น array ว่าง

        if (carIds.length === 0) {

            return {

                data: [],

                total: 0,

                page,

                limit,

                totalPages: 0

            };

        }



        // ค้นหา Entry-Exit Records ที่มี car_id อยู่ในรายการรถที่พบ

        const [records, total] = await this.parkingRecordRepository.findAndCount({

            where: {

                car_id: In(carIds),

                exit_time: Not(IsNull()) // กรองเฉพาะรายการที่ออกแล้ว

            },

            relations: {

                car: true,

                payments: true

            },

            order: { exit_time: 'DESC' },

            skip,

            take: limit,

        });



        // แปลงข้อมูลพร้อมคำนวณค่าบริการและสถานะ VIP

        const processedRecords = records.map(record => {

            const parkedTimeMs = record.exit_time.getTime() - record.entry_time.getTime();

            const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);

            const parkingFee = this.calculateParkingFee(parkedHours, rates);



            // ตรวจสอบสถานะ VIP

            const isVip = record.car?.vip_expiry_date

                ? new Date(record.car.vip_expiry_date) > currentTime

                : false;



            // หาข้อมูลส่วนลด

            const unpaidPayment = record.payments.find(p => p.paid_at === null);

            const discount = unpaidPayment ? unpaidPayment.discount : 0;



            // คำนวณค่าจอดรถหลังหักส่วนลด

            const parkingFeeAfterDiscount = Math.max(0, parkingFee - discount);



            return {

                ...record,

                parkedHours,

                parkingFee: parkingFeeAfterDiscount,

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



    // เพิ่มเมธอดใหม่สำหรับการค้นหา All Parking Records ด้วยป้ายทะเบียน

    async searchAllParkingRecordsByLicensePlate(@Body() searchDto: LicensePlateSearchDto) {
        const {
            licensePlate,
            page = 1,
            limit = 10,
            sortBy = 'entry_time',
            sortOrder = 'DESC'
        } = searchDto;
    
        // Get configuration
        const config = await this.getConfiguration();
        const rates = await this.getParkingRates();
    
        const skip = (page - 1) * limit;
        const currentTime = new Date();
    
        // หารถด้วยเงื่อนไข like สำหรับป้ายทะเบียน
        const carsWithSimilarLicensePlate = await this.carRepository.find({
            where: { license_plate: ILike(`%${licensePlate}%`) }
        });
    
        // ดึง car_id ออกมาเป็น array
        const carIds = carsWithSimilarLicensePlate.map(car => car.car_id);
    
        // ถ้าไม่พบรถที่มีป้ายทะเบียนคล้ายกัน ให้คืนค่าเป็นข้อมูลว่าง
        if (carIds.length === 0) {
            return {
                data:[],
                pagination: {
                    current_page: page,
                    page_size: limit,
                    total_active_entries: 0,
                    total_completed_entries: 0,
                    total_entries: 0
                }
            };
        }
    
        // Fetch active entries (entry records) ของรถที่มีป้ายทะเบียนคล้ายกัน
        const [activeEntries, activeTotal] = await this.parkingRecordRepository.findAndCount({
            where: {
                car_id: In(carIds),
                exit_time: IsNull()
            },
            order: {
                entry_time: sortOrder === 'DESC' ? 'DESC' : 'ASC',
            },
            relations: ['car', 'car.member', 'payments'],
            skip,
            take: limit,
        });
    
        // Fetch completed entries (entry-exit records) ของรถที่มีป้ายทะเบียนคล้ายกัน
        const [completedEntries, completedTotal] = await this.parkingRecordRepository.findAndCount({
            where: {
                car_id: In(carIds),
                exit_time: Not(IsNull())
            },
            order: {
                exit_time: sortOrder === 'DESC' ? 'DESC' : 'ASC',
            },
            relations: ['car', 'car.member', 'payments'],
            skip,
            take: limit,
        });
    
        // Process active entries
        const processedActiveEntries = await Promise.all(activeEntries.map(async (entry) => {
            let parkingFee = 0;
            let parkedHours = 0;
    
            // Find the latest payment (paid or unpaid)
            const latestPayment = entry.payments.sort((a, b) => (b.payment_id - a.payment_id))[0];
    
            if (latestPayment.paid_at) {
                // ดึงค่าจอดจาก amount ใน payment
                parkingFee = latestPayment.amount;
                const parkedTimeMs = currentTime.getTime() - entry.entry_time.getTime();
                parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
            } else {
                // คำนวณค่าจอดปกติ
                const parkedTimeMs = currentTime.getTime() - entry.entry_time.getTime();
                parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
                parkingFee = this.calculateParkingFee(parkedHours, rates);
                // Find applicable discount (if any)
                const discount = latestPayment ? latestPayment.discount : 0;
                // Calculate parking fee after discount
                parkingFee = Math.max(0, parkingFee - discount);
    
                // Update the latest payment with the calculated amount
                await this.paymentRepository.update(
                    { payment_id: latestPayment.payment_id },
                    { amount: parkingFee }
                );
            }
    
            const isVip = entry.car?.vip_expiry_date
                ? new Date(entry.car.vip_expiry_date) > currentTime
                : false;
    
            return {
                entry_records_id: entry.parking_record_id,
                car_id: entry.car_id,
                type: 'active',
                entry_time: entry.entry_time,
                exit_time: null,
                entry_car_image_path: entry.entry_car_image_path,
                car: entry.car ? {
                    car_id: entry.car.car_id,
                    license_plate: entry.car.license_plate,
                    vip_expiry_date: entry.car.vip_expiry_date,
                    member_id: entry.car.member?.member_id,
                    isVip,
                } : null,
                parked_hours: parkedHours,
                parking_fee: Math.floor(parkingFee),
                payments: entry.payments ? entry.payments.map(payment => ({
                    payment_id: payment.payment_id,
                    entry_record_id: payment.parking_record_id,
                    amount: payment.amount,
                    discount: payment.discount,
                    paid_at: payment.paid_at,
                })) :[],
            };
        }));
    
        // Process completed entries (no changes here)
        const processedCompletedEntries = completedEntries.map(entry => {
            const parkedTimeMs = entry.exit_time.getTime() - entry.entry_time.getTime();
            const parkedHours = this.calculateRoundedHours(parkedTimeMs, config.minuteRoundingThreshold);
            const parkingFee = entry.payments.reduce((sum, p) => sum + p.amount, 0);
            const isVip = entry.car?.vip_expiry_date
                ? new Date(entry.car.vip_expiry_date) > currentTime
                : false;
    
            return {
                entry_exit_records_id: entry.parking_record_id,
                car_id: entry.car_id,
                type: 'completed',
                entry_time: entry.entry_time,
                exit_time: entry.exit_time,
                entry_car_image_path: entry.entry_car_image_path,
                car: entry.car ? {
                    car_id: entry.car.car_id,
                    license_plate: entry.car.license_plate,
                    vip_expiry_date: entry.car.vip_expiry_date,
                    member_id: entry.car.member?.member_id,
                    isVip,
                } : null,
                parked_hours: parkedHours,
                parking_fee: Math.max(0, parkingFee - 0),
                payments: entry.payments ? entry.payments.map(payment => ({
                    payment_id: payment.payment_id,
                    entry_exit_record_id: payment.parking_record_id,
                    amount: payment.amount,
                    discount: payment.discount,
                    paid_at: payment.paid_at,
                })) :[],
            };
        });
    
        // Combine and sort entries
        const allEntries = [...processedActiveEntries, ...processedCompletedEntries]
            .sort((a, b) => {
                const timeA = sortBy === 'entry_time' ? a.entry_time : a.exit_time || a.entry_time;
                const timeB = sortBy === 'entry_time' ? b.entry_time : a.exit_time || b.entry_time;
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

        return remainingMinutes > minuteRoundingThreshold ? integerHours + 1 : integerHours;

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
            const { car, latestEntry } = await this.getLatestEntryAndCar(licensePlate);
            const currentTime = new Date();
    
            // Get configuration and parking rates
            const config = await this.getConfiguration();
            const rates = await this.getParkingRates();
    
            // Find the latest paid payment
            const lastPaidPayment = await this.paymentRepository.findOne({
                where: {
                    parking_record_id: latestEntry.parking_record_id,
                    paid_at: Not(IsNull()),
                },
                order: { paid_at: 'DESC' },
            });
    
            // Find any unpaid payment record to get discount
            const unPaidPayment = await this.paymentRepository.findOne({
                where: {
                    parking_record_id: latestEntry.parking_record_id,
                    paid_at: IsNull(),
                },
            });
    
            let startTime = latestEntry.entry_time;
            let validUntil = null;
            let previouslyPaidHours = 0;
            let needNewPayment = true;
    
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
                // Calculate total parked hours
                const totalParkedTimeMs = currentTime.getTime() - startTime.getTime();
                parkedHours = this.calculateRoundedHours(totalParkedTimeMs, config.minuteRoundingThreshold);
    
                // Calculate parking fee
                amount = this.calculateParkingFee(parkedHours, rates);
    
                // Calculate amount after discount
                amountAfterDiscount = Math.max(0, amount - currentDiscount);
            }
    
            // Update or create payment record
            let paymentRecord = unPaidPayment;
            if (!paymentRecord) {
                paymentRecord = this.paymentRepository.create({
                    parking_record_id: latestEntry.parking_record_id,
                    amount: 0,
                    discount: currentDiscount,
                    paid_at: null,
                });
                await queryRunner.manager.save(paymentRecord);
            }
    
            // Update payment record with new amount
            await this.paymentRepository
                .createQueryBuilder()
                .update(Payment)
                .set({
                    amount: amountAfterDiscount,
                    paid_at: currentTime,
                })
                .where('payment_id = :id', { id: paymentRecord.payment_id })
                .execute();
    
            await queryRunner.commitTransaction();
    
            // Fetch the updated payment record
            const updatedPayment = await this.paymentRepository.findOne({
                where: { payment_id: paymentRecord.payment_id },
            });
    
            return {
                paymentId: updatedPayment.payment_id,
                licensePlate,
                originalAmount: amount,
                discount: updatedPayment.discount,
                amount: updatedPayment.amount,
                paidAt: updatedPayment.paid_at,
                entryTime: latestEntry.entry_time,
                startTime,
                previouslyPaidHours,
                continuedFromHour: previouslyPaidHours,
                nextHourRate: amount > 0 ? amount / parkedHours : 0
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

            // Get car and latest entry data

            const { car, latestEntry } = await this.getLatestEntryAndCar(licensePlate);



            // Check if any payment is needed

            const paymentStatus = await this.checkPaymentAmount(licensePlate);



            // แก้ไขตรงนี้: ตรวจสอบว่า newPaymentDetails มีค่าหรือไม่ก่อนพยายามเข้าถึง

            const amountDue = paymentStatus.needNewPayment && paymentStatus.newPaymentDetails

                ? paymentStatus.newPaymentDetails.amountAfterDiscount

                : 0;



            // ถ้าค่าจอดรถหลังหักส่วนลดไม่เกิน 0 หรือไม่จำเป็นต้องชำระเงินเพิ่ม ให้ถือว่าชำระครบแล้ว และอัปเดต paid_at

            if (paymentStatus.needNewPayment && amountDue <= 0) {

                for (const payment of latestEntry.payments) {

                    if (!payment.paid_at) {

                        payment.paid_at = new Date();

                        await queryRunner.manager.save(payment);

                    }

                }

            } else if (amountDue > 0) {

                throw new BadRequestException({

                    message: `ไม่สามารถออกได้: ต้องชำระค่าจอดรถเพิ่ม ${amountDue} บาท`,

                    error: "Bad Request",

                    statusCode: 400,

                    paymentDetails: {

                        amountDue,

                        originalAmount: paymentStatus.newPaymentDetails?.originalAmount,

                        discount: paymentStatus.newPaymentDetails?.discount

                    }

                });

            }



            // Check for unpaid payments

            const hasUnpaidPayments = latestEntry.payments.some(p => p.paid_at === null);

            if (hasUnpaidPayments) {

                throw new BadRequestException('ไม่สามารถออกได้: มีรายการที่ยังไม่ได้ชำระ');

            }



            // Update exit_time in ParkingRecord

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

                parkingRecordId: savedEntryExit.parking_record_id,

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

                exit_time: IsNull()  // เพิ่มเงื่อนไขนี้เพื่อดึงเฉพาะ active entries

            },

            relations: ['payments'],

            order: { entry_time: 'DESC' }

        });



        // ดึงข้อมูลการเข้า-ออกที่สมบูรณ์แล้ว พร้อม payments

        const completedEntries = await this.parkingRecordRepository.find({

            where: {

                car_id: car.car_id,

                exit_time: Not(IsNull())  // เพิ่มเงื่อนไขนี้เพื่อดึงเฉพาะ completed entries

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



    // async checkPaymentAmount(licensePlate: string) {

    //     const queryRunner = this.dataSource.createQueryRunner();

    //     await queryRunner.connect();

    //     await queryRunner.startTransaction();



    //     try {

    //         const { latestEntry } = await this.getLatestEntryAndCar(licensePlate);

    //         const currentTime = new Date();

    //         let startTime = latestEntry.entry_time;

    //         let needNewPayment = true;



    //         // Get configuration and parking rates

    //         const config = await this.getConfiguration();

    //         const rates = await this.getParkingRates();



    //         // Find the latest paid payment

    //         const lastPaidPayment = await this.paymentRepository.findOne({

    //             where: {

    //                 parking_record_id: latestEntry.parking_record_id,

    //                 paid_at: Not(IsNull()),

    //             },

    //             order: { paid_at: 'DESC' },

    //         });



    //         // Find any unpaid payment record to get discount

    //         const unPaidPayment = await this.paymentRepository.findOne({

    //             where: {

    //                 parking_record_id: latestEntry.parking_record_id,

    //                 paid_at: IsNull(),

    //             },

    //         });



    //         let validUntil = null;

    //         let previouslyPaidHours = 0;



    //         // Check if the last payment is still valid

    //         if (lastPaidPayment) {

    //             const paidAtMs = new Date(lastPaidPayment.paid_at).getTime();

    //             const validUntilMs = paidAtMs + (config.exitBufferTime * 60 * 1000);

    //             validUntil = new Date(validUntilMs);



    //             // Calculate previously paid hours

    //             previouslyPaidHours = Math.ceil(

    //                 (validUntil.getTime() - latestEntry.entry_time.getTime()) / (1000 * 60 * 60)

    //             );



    //             if (currentTime.getTime() <= validUntilMs) {

    //                 startTime = new Date(lastPaidPayment.paid_at);

    //                 needNewPayment = false;

    //             } else {

    //                 startTime = validUntil;

    //                 needNewPayment = true;

    //             }

    //         }



    //         let parkedHours = 0;

    //         let amount = 0;

    //         let amountAfterDiscount = 0;

    //         const currentDiscount = unPaidPayment?.discount || 0;



    //         if (needNewPayment) {

    //             // Calculate total parked hours

    //             const totalParkedTimeMs = currentTime.getTime() - startTime.getTime();

    //             parkedHours = this.calculateRoundedHours(totalParkedTimeMs, config.minuteRoundingThreshold);



    //             // Use the same fee calculation logic as calculateParkingFee

    //             amount = this.calculateParkingFee(parkedHours, rates);



    //             // Calculate amount after discount

    //             amountAfterDiscount = Math.max(0, amount - currentDiscount);

    //         }



    //         // Create a new initial payment record if needed

    //         if (needNewPayment && !unPaidPayment) {

    //             const newInitialPayment = this.paymentRepository.create({

    //                 parking_record_id: latestEntry.parking_record_id,

    //                 amount: 0,

    //                 discount: currentDiscount,

    //                 paid_at: null,
                  


    //             });

    //             await queryRunner.manager.save(newInitialPayment);

    //         }



    //         await queryRunner.commitTransaction();



    //         // Debug logs

    //         console.log('Previous Paid Hours:', previouslyPaidHours);

    //         console.log('Parked Hours:', parkedHours);

    //         console.log('Amount Before Discount:', amount);

    //         console.log('Current Discount:', currentDiscount);

    //         console.log('Amount After Discount:', amountAfterDiscount);



    //         const response = {

    //             licensePlate,

    //             entryTime: latestEntry.entry_time,

    //             lastPayment: lastPaidPayment

    //                 ? {

    //                     paymentId: lastPaidPayment.payment_id,

    //                     amount: lastPaidPayment.amount,

    //                     paidAt: lastPaidPayment.paid_at,

    //                     validUntil,

    //                     paidHours: previouslyPaidHours

    //                 }

    //                 : null,

    //             currentTime,

    //             needNewPayment,

    //             newPaymentDetails: needNewPayment

    //                 ? {

    //                     startTime,

    //                     parkedHours,

    //                     originalAmount: amount,

    //                     discount: currentDiscount,

    //                     amountAfterDiscount,

    //                     roundingThreshold: config.minuteRoundingThreshold,

    //                     continuedFromHour: previouslyPaidHours,

    //                     nextHourRate: amount / parkedHours // average rate per hour

    //                 }

    //                 : null,

    //         };



    //         console.log('Response:', JSON.stringify(response, null, 2));

    //         return response;



    //     } catch (error) {

    //         await queryRunner.rollbackTransaction();

    //         throw error;

    //     } finally {

    //         await queryRunner.release();

    //     }

    // }

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
                    parking_record_id: latestEntry.parking_record_id,
                    paid_at: Not(IsNull()),
                },
                order: { paid_at: 'DESC' },
            });
    
            // Find any unpaid payment record to get discount
            const unPaidPayment = await this.paymentRepository.findOne({
                where: {
                    parking_record_id: latestEntry.parking_record_id,
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
                // Calculate total parked hours
                const totalParkedTimeMs = currentTime.getTime() - startTime.getTime();
                parkedHours = this.calculateRoundedHours(totalParkedTimeMs, config.minuteRoundingThreshold);
    
                // Use the same fee calculation logic as calculateParkingFee
                amount = this.calculateParkingFee(parkedHours, rates);
    
                // Calculate amount after discount
                amountAfterDiscount = Math.max(0, amount - currentDiscount);
            }
    
            // **REMOVED**: Create a new initial payment record if needed 
    
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
                        nextHourRate: amount / parkedHours // average rate per hour
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




    async getLatestPaymentHistory(licensePlate: string) {

        // ค้นหารถ

        const car = await this.carRepository.findOne({

            where: { license_plate: licensePlate }

        });



        if (!car) {

            throw new NotFoundException(`ไม่พบรถทะเบียน ${licensePlate}`);

        }



        // ดึงการตั้งค่า

        const config = await this.getConfiguration();

        const currentTime = new Date();

        const rates = await this.getParkingRates();



        // ดึงรายการจอดล่าสุด

        const latestEntry = await this.parkingRecordRepository

            .createQueryBuilder('parkingRecord')

            .leftJoinAndSelect('parkingRecord.payments', 'payments')

            .where('parkingRecord.car_id = :carId', { carId: car.car_id })

            .orderBy('parkingRecord.entry_time', 'DESC')

            .getOne();



        if (!latestEntry) {

            throw new NotFoundException(`ไม่พบประวัติการจอดของรถทะเบียน ${licensePlate}`);

        }



        // ค้นหาการชำระเงินล่าสุดที่จ่ายแล้ว

        const lastPaidPayment = await this.paymentRepository.findOne({

            where: {

                parking_record_id: latestEntry.parking_record_id,

                paid_at: Not(IsNull())

            },

            order: { paid_at: 'DESC' }

        });



        // ค้นหาการชำระเงินที่ยังไม่ได้จ่าย

        const unPaidPayment = await this.paymentRepository.findOne({

            where: {

                parking_record_id: latestEntry.parking_record_id,

                paid_at: IsNull()

            }

        });



        let needNewPayment = true;

        let startTime = latestEntry.entry_time;

        let validUntil = null;

        let previouslyPaidHours = 0;



        // ตรวจสอบการชำระเงินล่าสุด

        if (lastPaidPayment) {

            const paidAtMs = new Date(lastPaidPayment.paid_at).getTime();

            const validUntilMs = paidAtMs + (config.exitBufferTime * 60 * 1000);

            validUntil = new Date(validUntilMs);



            // คำนวณชั่วโมงที่จ่ายไปแล้ว

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



        let newPaymentDetails = null;

        if (needNewPayment) {

            // คำนวณชั่วโมงจอด

            const totalParkedTimeMs = currentTime.getTime() - startTime.getTime();

            const parkedHours = this.calculateRoundedHours(totalParkedTimeMs, config.minuteRoundingThreshold);



            // คำนวณค่าจอดรถ

            const amount = this.calculateParkingFee(parkedHours, rates);

            const currentDiscount = unPaidPayment?.discount || 0;

            const amountAfterDiscount = Math.max(0, amount - currentDiscount);



            newPaymentDetails = {

                startTime,

                parkedHours,

                originalAmount: amount,

                discount: currentDiscount,

                amountAfterDiscount,

                roundingThreshold: config.minuteRoundingThreshold,

                continuedFromHour: previouslyPaidHours,

                nextHourRate: amount / parkedHours

            };

        }



        return {

            licensePlate,

            latestPayment: lastPaidPayment

                ? {

                    paymentId: lastPaidPayment.payment_id,

                    amount: lastPaidPayment.amount,

                    discount: lastPaidPayment.discount,

                    paidAt: lastPaidPayment.paid_at,

                    exitBufferTime: config.exitBufferTime,

                    validUntil

                }

                : null,

            entryTime: latestEntry.entry_time,

            currentTime,

            needNewPayment,

            newPaymentDetails

        };

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




