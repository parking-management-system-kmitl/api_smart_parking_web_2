import { Injectable, ConflictException, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
  ) {}

  async onModuleInit() {  // <-- Add this lifecycle hook
    await this.createDefaultAdmin();
}

  @UseGuards(JwtAuthGuard)
  async createAdmin(
    admin_fname: string,
    admin_lname: string,
    admin_username: string,
    admin_password: string,
  ): Promise<Admin> {
    // ตรวจสอบว่ามี admin_username ซ้ำหรือไม่
    const existingAdmin = await this.adminRepository.findOne({
      where: { admin_username },
    });

    if (existingAdmin) {
      throw new ConflictException('Username already exists');
    }

    // เข้ารหัสรหัสผ่านก่อนบันทึก
    const hashedPassword = await bcrypt.hash(admin_password, 10);

    const admin = this.adminRepository.create({
      admin_fname,
      admin_lname,
      admin_username,
      admin_password: hashedPassword,
    });

    return await this.adminRepository.save(admin);
  }
  
  @UseGuards(JwtAuthGuard)
  async deleteAdmin(admin_id: number): Promise<void> {
    await this.adminRepository.delete(admin_id);
  }


  private async createDefaultAdmin(): Promise<void> {
    const existingAdmin = await this.adminRepository.findOne({ 
      where: {}
  });
    if (existingAdmin) {
        return; // Admin already exists
    }

    const defaultAdmin = {
        admin_fname: 'Root', // Default first name
        admin_lname: 'Admin',  // Default last name
        admin_username: 'admin', // Default username
        admin_password: await bcrypt.hash('admin123', 10), // Default hashed password
    };

    try {
        await this.adminRepository.save(defaultAdmin);
        console.log('Default admin user created successfully!');
    } catch (error) {
        console.error('Error creating default admin user:', error);
    }
}
}
