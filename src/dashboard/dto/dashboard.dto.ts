import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class DashboardDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value instanceof Date) return value;
    const date = new Date(value);
    // ใช้ constructor ปกติแทน Date.UTC เพื่อให้เป็นเวลาท้องถิ่น
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0, 0, 0, 0
    );
  })
  startDate?: Date;

  @IsOptional()
  @Transform(({ value }) => {
    if (value instanceof Date) return value;
    const date = new Date(value);
    // ใช้ constructor ปกติแทน Date.UTC
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23, 59, 59, 999 // เพิ่มเวลาเป็นสิ้นสุดวัน
    );
  })
  endDate?: Date;
}