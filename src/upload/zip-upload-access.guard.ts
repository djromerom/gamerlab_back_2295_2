import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PUBLIC_LIMITS } from '../common/throttle/public-throttle';
import { RecaptchaService } from '../teams/services/recaptcha.service';

/*
 Acceso a POST /upload/zip: exige sesión (request.user, puesta por OptionalJwtAuthGuard)
 o, si no hay sesión, un token reCAPTCHA válido en la cabecera x-recaptcha-token.
 El token va en cabecera (no en el cuerpo) porque los guards corren antes de que
 multer lea el multipart, y así se rechaza sin cargar el archivo en memoria.
*/
@Injectable()
export class ZipUploadAccessGuard implements CanActivate {
  constructor(
    private readonly recaptchaService: RecaptchaService,
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: unknown;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    if (req.user) return true;

    const header = req.headers?.['x-recaptcha-token'];
    const token: string | undefined = Array.isArray(header)
      ? header[0]
      : header;
    if (!token || !(await this.recaptchaService.verify(token))) {
      throw new UnauthorizedException(
        'Se requiere sesión o una verificación reCAPTCHA válida',
      );
    }

    // Límite por IP solo para anónimos (con sesión no se limita). Se cuenta después de
    // validar el reCAPTCHA para que peticiones sin token (401) no consuman cupo.
    const { limit, ttl } = PUBLIC_LIMITS.zipUpload;
    const record = await this.storage.increment(
      `zip-upload:${req.ip ?? 'unknown'}`,
      ttl,
      limit,
      ttl,
      'zip-upload',
    );
    if (record.isBlocked) {
      throw new HttpException(
        'Demasiadas peticiones, inténtelo más tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
