import { Controller, Post, Body, UsePipes, ValidationPipe, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { DashboardDto } from "./dto/dashboard.dto";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  
  @Post()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ 
    transform: true,
    transformOptions: { 
      enableImplicitConversion: true 
    }
  }))
  async getDashboardData(@Body() dto: DashboardDto) {
    return this.dashboardService.getDashboardData(dto);
  }
}