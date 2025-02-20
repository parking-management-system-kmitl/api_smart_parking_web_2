import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Car } from './car.entity';
import { Payment } from './payment.entity';

@Entity('ParkingRecords') // เปลี่ยนชื่อ Entity และ Table
export class ParkingRecord {
  @PrimaryGeneratedColumn()
  parking_record_id: number; // เปลี่ยนชื่อ ID

  @Column()
  car_id: number;

  @Column({ type: 'timestamp' })
  entry_time: Date;

  @Column({ type: 'timestamp', nullable: true }) // exit_time อาจไม่มีถ้ายังไม่ exit
  exit_time: Date;

  @Column({ type: 'text', nullable: true })
  entry_car_image_path: string;

  @Column({ type: 'text', nullable: true }) // เพิ่ม column สำหรับ exit image path
  exit_car_image_path: string;

  @ManyToOne(() => Car, car => car.parkingRecords) // เปลี่ยน relation
  @JoinColumn({ name: 'car_id' })
  car: Car;

  @OneToMany(() => Payment, payment => payment.parkingRecord) // เปลี่ยน relation
  payments: Payment[];
}