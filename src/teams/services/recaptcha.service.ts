/* eslint-disable prettier/prettier */
// src/teams/services/recaptcha.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { RecaptchaResponse } from '../interfaces/recaptcha-response.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private readonly recaptchaSecret: string;
  private readonly verifyUrl: string;
  private readonly threshold: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const RECAPTCHA_SECRET_KEY = this.configService.get<string>(
      'RECAPTCHA_SECRET_KEY',
    );

    const RECAPTCHA_URL = this.configService.get<string>('RECAPTCHA_URL');

    const RECAPTCHA_SCORE = this.configService.get<number>('RECAPTCHA_SCORE');

    if (!RECAPTCHA_SECRET_KEY) {
      this.logger.error(
        `FATAL: Configuration Error during onModuleInit - Secret 'reCAPTCHA' not found. Application might not function correctly.`,
      );
      throw new InternalServerErrorException(
        `Server configuration error: Missing required status 'reCAPTCHA'.`,
      );
    } else if (!RECAPTCHA_URL) {
      this.logger.warn(
        `No 'RECAPTCHA_URL' variable was found in the environment. Using default url`,
      );
      this.verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    } else if (!RECAPTCHA_SCORE) {
      this.logger.warn(
        `No 'RECAPTCHA_SCORE' variable was found in the environment. Using '0.5' as default`,
      );
      this.threshold = 0.5;
    }

    this.recaptchaSecret = RECAPTCHA_SECRET_KEY;
  }

  async verify(token: string): Promise<boolean> {
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
        this.httpService.post<RecaptchaResponse>(this.verifyUrl, null, {
          params: {
            secret: this.recaptchaSecret,
            response: token,
          },
        }),
      );

      const data = response.data;

      if (!data.success) {
        this.logger.warn(
          `reCAPTCHA verification failed: ${data['error-codes']?.join(', ')}`,
        );
        return false;
      }

      // Para reCAPTCHA v3, verificar el score
      if (data.score !== undefined && data.score < this.threshold) {
        this.logger.warn(`reCAPTCHA score too low: ${data.score}`);
        return false;
      }

      this.logger.log(
        `reCAPTCHA verification successful${data.score !== undefined ? ` with score: ${data.score}` : ''}`,
      );
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `reCAPTCHA verification error: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `reCAPTCHA verification error: ${JSON.stringify(error)}`,
        );
      }
      return false;
    }
  }
}
