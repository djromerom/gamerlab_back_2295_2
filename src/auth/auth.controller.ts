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
  UnauthorizedException,
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
import { ConfigService } from '@nestjs/config';
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
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiQuery,
  ApiInternalServerErrorResponse,
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

  // Login
  @Public()
  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: 'Log in' })
  @ApiBody({
    type: LoginDto,
    examples: {
      admin: {
        summary: 'Admin Login',
        value: { email: 'admin@uninorte.edu.co', password: 'Pass1234' },
      },
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
    return this.authService.login(loginDto, 'PASSWORD', res);
  }

  @Public()
  @Get('outlook-login')
  async outlookLogin(@Res() res: Response) {
    const url = this.authService.getAuthorizeUrl();
    return res.redirect(url);
  }

  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'Microsoft Entra ID OAuth callback' })
  @ApiQuery({
    name: 'code',
    description: 'Authorization code from Microsoft',
    type: String,
    required: true
  })
  @ApiOkResponse({ description: 'Authentication successful, redirects to frontend' })
  @ApiUnauthorizedResponse({ description: 'Authentication failed, redirects to error page' })
  async callback(@Query('code') code: string, @Res() res: Response) {
    return this.authService.handleMicrosoftCallback(code, res);
  }

  // Refresh tokens
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
  @ApiUnauthorizedResponse({ description: 'Refresh token invalid or missing' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('silent') silent?: string,
  ) {
    try {
      return await this.authService.refresh(req, res);
    } catch (error) {
      if (silent === 'true' && error instanceof UnauthorizedException) {
        return { accessToken: null, message: 'No session' };
      }
      throw error;
    }
  }

  // Resend confirmation email
  @Public()
  @Post('resend-confirmation')
  @ApiOperation({ summary: 'Resend confirmation email' })
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    type: ResendConfirmationDto,
    examples: {
      student: {
        summary: 'Resend Confirmation Email',
        value: { email: 'estudiante@uninorte.edu.co' },
      },
    },
  })
  @ApiOkResponse({ description: 'Confirmation email sent successfully.' })
  @ApiNotFoundResponse({ description: 'User with the provided email does not exist.' })
  @ApiConflictResponse({ description: 'User is already confirmed.' })
  async sendconfirmationEmail(@Body() body: ResendConfirmationDto) {
    return await this.authService.resendAuthEmailOfType(body.email, 'VERIFICACION_EMAIL');
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Send password reset email' })
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    type: ResendConfirmationDto,
    examples: {
      student: {
        summary: 'Send Reset Password Email',
        value: { email: 'estudiante@uninorte.edu.co' },
      },
    },
  })
  @ApiOkResponse({ description: 'Password reset email sent successfully.' })
  @ApiNotFoundResponse({ description: 'User with the provided email does not exist.' })
  async sendResetPasswordEmail(@Body() body: ResendConfirmationDto) {
    return await this.authService.resendAuthEmailOfType(
      body.email,
      'RESETEAR_CONTRASENA',
    );
  }

  @Public()
  @Post('set-password')
  @ApiOperation({ summary: 'Set new password using reset token' })
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    type: SetPasswordDto,
    examples: {
      example1: {
        summary: 'Set New Password',
        value: { token: 'd8bccad1-0faa-40c0-a8a3-6e6962090c69', password: 'NewPass1234' },
      },
    },
  })
  @ApiOkResponse({ description: 'Password updated successfully' })
  @ApiBadRequestResponse({
    description: 'Bad Request',
    content: {
      'application/json': {
        examples: {
          invalidTokenOrPassword: {
            summary: 'Invalid token or password format',
            value: { statusCode: 400, message: 'Invalid token or password format', error: 'Bad Request' },
          },
          tokenExpired: {
            summary: 'Token has expired',
            value: { statusCode: 400, message: 'Token has expired', error: 'Bad Request' },
          },
        },
      },
    },
  })
  async setPassword(
    @Body() setPasswordDto: SetPasswordDto,
  ): Promise<{ message: string }> {
    const { token, password } = setPasswordDto;
    await this.authService.setUserPassword(token, password);
    return { message: 'Password updated successfully' };
  }

  @Public()
  @Get('verify-token')
  @ApiOperation({ summary: 'Verify token validity (Default type: Verification)' })
  @HttpCode(HttpStatus.OK)
  @ApiQuery({
    name: 'token',
    description: 'The token to verify',
    type: String,
    required: true,
    example: 'd8bccad1-0faa-40c0-a8a3-6e6962090c69'
  })
  @ApiQuery({
    name: 'type',
    description: 'Type of token to verify',
    enum: ['VERIFICACION_EMAIL', 'RESETEAR_CONTRASENA'],
    required: false,
    example: 'VERIFICACION_EMAIL'
  })
  @ApiOkResponse({ 
    description: 'Token is valid', 
    schema: { 
      example: { 
        isValid: true, 
        message: 'Token is valid.',
        email: 'user@example.com',
        userId: 'abc-123',
        type: 'VERIFICACION_EMAIL'
      } 
    } 
  })
  @ApiBadRequestResponse({ 
    description: 'Invalid token, expired token, or wrong token type',
    schema: {
      example: { 
        message: 'Invalid or expired link.', 
        error: 'Bad Request', 
        statusCode: 400 
      }
    }
  })
  async verifyTokenGet(@Query() query: VerifyTokenDto) {
    const { token, type } = query;
    return this.authService.verifyTokenValidity(token, type);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Logout user' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ 
    description: 'Logout successful',
    schema: {
      example: {
        message: 'Logout successful'
      }
    }
  })
  @ApiInternalServerErrorResponse({ 
    description: 'Server error during logout process',
    schema: {
      example: {
        message: 'Failed to clear authentication cookies',
        error: 'Internal Server Error',
        statusCode: 500
      }
    }
  })
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  @Post('reset-token-expiration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset Expiration of Token' })
  @ApiBearerAuth('access')
  @ApiBody({
    type: ResetTokenExpirationDto,
    examples: {
      example1: {
        summary: 'Reset Token Expiration',
        value: { userId: '0588fbb6-534f-4e85-a37f-ca090b9a3059', typeOfToken: 'VERIFICACION_EMAIL' },
      },
    },
  })
  @ApiOkResponse({ description: 'Token expiration date reset successfully' })
  @ApiNotFoundResponse({ description: 'Token not found for the user and type' })
  async resetTokenExpiration(
    @Body() body: ResetTokenExpirationDto,
  ): Promise<{ message: string }> {
    await this.authService.resetTokenExpiration(body.userId, body.typeOfToken);
    return { message: 'Token expiration date reset successfully' };
  }

  @Get('me')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetMyProfile')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiBearerAuth('access')
  // The @GetUser decorator gets the user populated
  // by the JwtStrategy after successful cookie authentication
  @ApiOkResponse({
    description: 'User profile retrieved successfully',
    schema: {
      example: {
        id: '0588fbb6-534f-4e85-a37f-ca090b9a3059',
        email: 'estudiante@uninorte.edu.co',
        firstName: 'Pedro',
        lastName: 'Perez',
        isActive: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        lastSignInAt: '2025-01-10T00:00:00.000Z',
        role: {
          id: 2,
          name: 'Estudiante'
        },
        confirmationStatus: {
          status: 'CONFIRMADO'
        }
      },
    }
  })
  @ApiNotFoundResponse({ description: 'User profile not found' })
  @ApiUnauthorizedResponse({ description: 'No access token provided' })
  async getMyProfile(@GetUser() user: AppUser) {
    return this.authService.getMyProfile(user.id);
  }
}
