import { 
    Controller, 
    Post, 
    Body,
    HttpCode, 
    HttpStatus, 
    BadRequestException
   } from '@nestjs/common';
   import { MemberService } from './member.service';
   import { CreateMemberDto } from './dto/create-member.dto';
   import { LinkCarDto } from './dto/link-car.dto';
   import { CheckPhoneDto } from './dto/check-phone.dto';
   
   @Controller('member')
   export class MemberController {
    constructor(
      private readonly memberService: MemberService
    ) {}
   
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    async registerMember(@Body() memberData: CreateMemberDto) {
      return this.memberService.registerMember(memberData);
    }
   
    @Post('link-car')
    @HttpCode(HttpStatus.CREATED)
    async linkCarToMember(@Body() linkCarDto: LinkCarDto) {
      return this.memberService.linkCarToMember(linkCarDto);
    }

    @Post('unlink-car')
  async unlinkCar(@Body() body: { car_id: number }) {
    return this.memberService.unlinkCar(body.car_id);
  }
   
    @Post('check-phone')
    @HttpCode(HttpStatus.OK)
    async checkPhoneNumber(@Body() checkPhoneDto: CheckPhoneDto) {
      return this.memberService.checkPhoneNumber(checkPhoneDto.phone);
    }

    @Post('preparereg')
    async prepareRegistration(
      @Body('phone') phone: string,
      @Body('licenseplate') licenseplate: string,
    ) {
      if (!phone || !licenseplate) {
        throw new BadRequestException('Both phone and licenseplate are required');
      }
  
      return this.memberService.prepareReg({ phone, licenseplate });
    }
   }