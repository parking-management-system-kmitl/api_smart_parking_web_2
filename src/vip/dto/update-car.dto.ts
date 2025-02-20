import { IsOptional, IsString } from "class-validator";

export class UpdateCarDto {
  @IsOptional()
  @IsString()
  license_plate: string;
}