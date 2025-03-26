// src/auth/rate-limit.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit'; // แก้ไขการ import ตรงนี้

@Injectable()
export class LoginRateLimitMiddleware implements NestMiddleware {
  private limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 10, // จำกัด 10 ครั้งต่อ IP ในช่วงเวลาที่กำหนด
    standardHeaders: true,
    message: { 
      statusCode: 429, 
      message: 'Too many login attempts, please try again after 15 minutes',
      error: 'Too Many Requests'
    }
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.limiter(req, res, next);
  }
}