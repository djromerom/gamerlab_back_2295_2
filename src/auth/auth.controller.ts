import {
  Controller,
  Post,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
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
import { AppUser } from './jwt.strategy';
import { GetUser } from './decorators/get-user.decorator';
import { RolePermissionGuard } from './guards/role-permission.guard';
import { RequiredService } from './decorators/required-service.decorator';
import { SetPasswordDto } from './dto/set-password.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { ResetTokenExpirationDto } from './dto/reset-token-expiration.dto';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

class AuthTokensDoc {
  message: string;
  access: string;
  refresh: string
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Log in' })
    @ApiBody({
    type: LoginDto,
    examples: {
      student: {
        summary: 'Student Login',
        value: { email: 'estudiante@uninorte.edu.co', password: 'Pass1234' },
      },
      professor: {
        summary: 'Professor Login',
        value: { email: 'profesor@uninorte.edu.co', password: 'Pass1234' },
      },
      juror: {
        summary: 'Juror Login',
        value: { email: 'jurado@uninorte.edu.co', password: 'Pass1234' },
      },
      admin: {
        summary: 'Admin Login',
        value: { email: 'admin@uninorte.edu.co', password: 'Pass1234' },
      },
    },
  })
  @ApiCreatedResponse({ 
    description: 'Successful login', 
    schema: {
      example: {
        message: 'Login successful',
        access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      }
    }
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Invalid data format' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(loginDto, res);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh tokens',
    description:
      'Requires a valid refresh token in the request cookies to issue new access and refresh tokens.',
  })
  @ApiBearerAuth('refresh')
  @ApiCreatedResponse({ 
    description: 'Refresh successful', 
    type: AuthTokensDoc,
    schema: {
      example: {
        access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      }
    }
  })
  @ApiUnauthorizedResponse({ description: 'Refresh token invalid o expired' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(req, res);
  }

  @Post('resend-confirmation')
  @HttpCode(HttpStatus.OK)
  async sendconfirmationEmail(@Body() body: ResendConfirmationDto) {
    return await this.authService.resendEmailOfType(body.email, 'CONFIRMATION');
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async sendResetPasswordEmail(@Body() body: ResendConfirmationDto) {
    return await this.authService.resendEmailOfType(
      body.email,
      'RESET_PASSWORD',
    );
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Body() setPasswordDto: SetPasswordDto,
  ): Promise<{ message: string }> {
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
  async resetTokenExpiration(
    @Body() body: ResetTokenExpirationDto,
  ): Promise<{ message: string }> {
    await this.authService.resetTokenExpiration(body.userId);
    return { message: 'Token expiration date reset successfully' };
  }

  @Get('me')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetMyProfile')
  // The @GetUser decorator gets the user populated
  // by the JwtStrategy after successful cookie authentication
  async getMyProfile(@GetUser() user: AppUser) {
    return this.authService.getMyProfile(user.id);
  }
}
