import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { AppUser } from '../auth/jwt.strategy';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

/*
 Guard de las rutas públicas de inscripción (POST /teams, /upload, /upload/zip).
 Con las inscripciones cerradas responde 403 salvo que quien llama sea Administrador autenticado,
 así que debe ir después de OptionalJwtAuthGuard (que adjunta request.user si hay sesión válida).
 Con las inscripciones abiertas deja pasar a todos; el reCAPTCHA y el límite de peticiones
 siguen aplicándose después, en el servicio y en PublicThrottle.
*/
@Injectable()
export class RegistrationsOpenGuard extends RolePermissionGuard {
  constructor(
    private readonly settings: SettingsService,
    reflector: Reflector,
    prisma: PrismaService,
    cacheService: CacheService,
    configService: ConfigService,
  ) {
    super(reflector, prisma, cacheService, configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { registrationsOpen } = await this.settings.getRegistrationsOpen();
    if (registrationsOpen) return true;

    const user = context.switchToHttp().getRequest<{ user?: AppUser }>().user;
    if (user?.roleId !== undefined && user?.roleId !== null && (await this.isAdminRole(user.roleId))) {
      return true;
    }
    throw new ForbiddenException('Las inscripciones están cerradas');
  }
}
