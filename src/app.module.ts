// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Member } from './entities/member.entity';
import { Car } from './entities/car.entity';
import { ParkingRecord } from './entities/parking-record.entity';
import { Payment } from './entities/payment.entity';
import { ParkingModule } from './parking/parking.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admins/admin.module';
import { Admin } from './entities/admin.entity';
import { ConfigurationModule } from './configuration/configuration.module';
import { MemberModule } from './member/member.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { VipModule } from './vip/vip.module';
import { DiscountModule } from './discount/discount.module';
import { VipPromotionModule } from './vippromotion/vippromotion.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: +configService.get('DB_PORT'),
        username: configService.get('DB_USER'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        entities: [__dirname + '/entities/*.entity{.ts,.js}'], // โหลดทุกไฟล์ที่ลงท้ายด้วย .entity.ts หรือ .entity.js
        autoLoadEntities: true,
        synchronize: true, // Set to true only in development
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    AdminModule,
    ParkingModule,
    ConfigurationModule,
    MemberModule,
    DashboardModule,
    VipModule,
    DiscountModule,
    VipPromotionModule,

  ],
})
export class AppModule {}