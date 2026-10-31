import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RecaptchaService } from '../teams/services/recaptcha.service';

/*
 Acceso a POST /upload/zip: exige sesión (request.user, puesta por OptionalJwtAuthGuard)
 o, si no hay sesión, un token reCAPTCHA válido en la cabecera x-recaptcha-token.
 El token va en cabecera (no en el cuerpo) porque los guards corren antes de que
 multer lea el multipart, y así se rechaza sin cargar el archivo en memoria.
*/
@Injectable()
export class ZipUploadAccessGuard implements CanActivate {
  constructor(private readonly recaptchaService: RecaptchaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: unknown;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    if (req.user) return true;

    const header = req.headers?.['x-recaptcha-token'];
    const token: string | undefined = Array.isArray(header)
      ? header[0]
      : header;
    if (token && (await this.recaptchaService.verify(token))) return true;

    throw new UnauthorizedException(
      'Se requiere sesión o una verificación reCAPTCHA válida',
    );
  }
}
