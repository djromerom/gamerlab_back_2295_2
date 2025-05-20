/* eslint-disable prettier/prettier */
// src/teams/interfaces/recaptcha-response.interface.ts
export interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}