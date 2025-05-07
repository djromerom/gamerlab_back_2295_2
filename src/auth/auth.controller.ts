import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
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
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Public()
  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Req() req: RequestWithUser,
    @Body() setPasswordDto: SetPasswordDto,
  ): Promise<{ message: string }> {
    const userId = req.user.sub; // Obtains 'sub' from the validated payload
    await this.authService.setUserPassword(userId, setPasswordDto.password);
    return { message: 'Password updated successfully' };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  @Get('me')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetMyProfile')
  // The @GetUser decorator gets the user populated
  // by the SupabaseStrategy after successful cookie authentication
  async getMyProfile(@GetUser() user: AppUser) {
    return this.authService.getMyProfile(user.id);
  }

  @Post('update-user')
  @HttpCode(HttpStatus.OK)
  async updateUserProfile(
    @Req() req: RequestWithUser,
    @Body() updateData: Partial<User>,
  ): Promise<Partial<User>> {
    const userId = req.user.sub;
    return this.authService.updateUserProfile(userId, updateData);
  }
}
