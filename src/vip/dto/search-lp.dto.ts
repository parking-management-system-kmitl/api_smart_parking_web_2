// เพิ่ม DTO สำหรับค้นหา VIP ด้วยป้ายทะเบียน
export class SearchVipByLicensePlateDto {
    licensePlate: string;
    page?: number;
    limit?: number;
  }