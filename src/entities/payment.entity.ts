// src/entities/payment.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ParkingRecord } from './parking-record.entity';

@Entity('Payments')
export class Payment {
  @PrimaryGeneratedColumn()
  payment_id: number;

  // @Column({ nullable: true })
  // entry_record_id: number;

  // @Column({ nullable: true })
  // entry_exit_record_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, nullable: true })
  discount: number;

  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date;


  @ManyToOne(() => ParkingRecord, parkingRecord => parkingRecord.payments) // เปลี่ยน relation
@JoinColumn({ name: 'parking_record_id' }) // เปลี่ยนชื่อ JoinColumn
parkingRecord: ParkingRecord; // เปลี่ยนชื่อ property



@Column({ nullable: true }) //เปลี่ยนเป็น parking_record_id แทน
parking_record_id: number;
}

