/* eslint-disable prettier/prettier */
// src/teams/services/recaptcha.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { RecaptchaResponse } from '../interfaces/recaptcha-response.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly recaptchaSecret: string;
  private readonly verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
  private readonly threshold = 0.5; // Minimum score to consider valid (0.0 to 1.0)

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.recaptchaSecret = "6LcIWTorAAAAAKpQpnq8a3dfdNdfwB_b_Wu320il";
    if (!this.recaptchaSecret) {
      this.logger.warn('RECAPTCHA_SECRET_KEY is not defined in environment');
    }
  }

  async verify(token: string): Promise<boolean> {
    console.log(token)
    if (!this.recaptchaSecret) {
      this.logger.warn('reCAPTCHA verification skipped: Missing secret key');
      return process.env.NODE_ENV === 'development'; // En desarrollo permite pasar, en producción no
    }

    if (!token || token.trim() === '') {
      this.logger.warn('reCAPTCHA verification failed: Empty token');
      return false;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<RecaptchaResponse>(
          this.verifyUrl,
          null,
          {
            params: {
              secret: this.recaptchaSecret,
              response: token,
            },
          },
        ),
      );

      const data = response.data;
      
      if (!data.success) {
        this.logger.warn(`reCAPTCHA verification failed: ${data['error-codes']?.join(', ')}`);
        return false;
      }

      // Para reCAPTCHA v3, verificar el score
      if (data.score !== undefined && data.score < this.threshold) {
        this.logger.warn(`reCAPTCHA score too low: ${data.score}`);
        return false;
      }

      this.logger.log(`reCAPTCHA verification successful${data.score !== undefined ? ` with score: ${data.score}` : ''}`);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`reCAPTCHA verification error: ${error.message}`, error.stack);
      } else {
        this.logger.error(`reCAPTCHA verification error: ${JSON.stringify(error)}`);
      }
      return false;
    }
  }
}