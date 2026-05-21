import { IsUrl, ValidationOptions } from 'class-validator';
import { env } from 'node:process';

export function isEnvSensitiveUrl(validationOptions?: ValidationOptions): PropertyDecorator {
  return IsUrl(
    {
      require_tld: (env.NODE_ENV === 'production'),
    },
    validationOptions,
  );
}