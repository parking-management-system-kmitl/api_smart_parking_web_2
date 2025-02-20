// src/entities/car.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Member } from './member.entity';
import { ParkingRecord } from './parking-record.entity';

@Entity('Cars')
export class Car {
  @PrimaryGeneratedColumn()
  car_id: number;

  @Column()
  license_plate: string;

  @Column({ type: 'timestamp', nullable: true })
  vip_expiry_date: Date;

  // @Column({ nullable: true })
  // member_id: number;

  @ManyToOne(() => Member, member => member.cars)
  member: Member;


  @OneToMany(() => ParkingRecord, parkingRecord => parkingRecord.car) // เปลี่ยน relation
parkingRecords: ParkingRecord[]; // เปลี่ยนชื่อ property
}
