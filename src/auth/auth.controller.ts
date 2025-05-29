import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';
import { AppUser } from './supabase.strategy';
import { GetUser } from './decorators/get-user.decorator';
import { RolePermissionGuard } from './guards/role-permission.guard';
import { RequiredService } from './decorators/required-service.decorator';
import { SetPasswordDto } from './dto/set-password.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { ResetTokenExpirationDto } from './dto/reset-token-expiration.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(loginDto, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(req, res);
  }

  @Post('resend-confirmation')
  @HttpCode(HttpStatus.OK)
  async sendconfirmationEmail(@Body() body: ResendConfirmationDto) {
    return await this.authService.resendConfirmationEmail(body.email);
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  async setPassword(@Body() setPasswordDto: SetPasswordDto): Promise<{ message: string }> {
    const { token, password } = setPasswordDto;
    await this.authService.setUserPassword(token, password);
    return { message: 'Password updated successfully' };
  }

  @Public()
  @Get('verify-token')
  @HttpCode(HttpStatus.OK)
  async verifyTokenGet(@Query() query: VerifyTokenDto) {
    const { token, type } = query;
    return this.authService.verifyTokenValidity(token, type);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  @Post('reset-token-expiration')
  @HttpCode(HttpStatus.OK)
  async resetTokenExpiration(@Body() body: ResetTokenExpirationDto): Promise<{ message: string }> {
    await this.authService.resetTokenExpiration(body.userId);
    return { message: 'Token expiration date reset successfully' };
  }

  @Get('me')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetMyProfile')
  // The @GetUser decorator gets the user populated
  // by the SupabaseStrategy after successful cookie authentication
  async getMyProfile(@GetUser() user: AppUser) {
    return this.authService.getMyProfile(user.id);
  }
}
