import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
  } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRED_SERVICE_KEY } from '../decorators/required-service.decorator';
import { AppUser } from '../supabase.strategy';
  
@Injectable()
export class PendingGamesGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 2. Get user object from request
    const request = context.switchToHttp().getRequest();
    const user = request.user as AppUser;
    const jurorId = user.id; // Aquí obtienes el ID del jurado

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    const requiredServiceName =
          this.reflector.get<string>(REQUIRED_SERVICE_KEY, context.getHandler()) ??
          this.reflector.get<string>(REQUIRED_SERVICE_KEY, context.getClass());
    
    const requiredService = this.reflector.get<string>(
      'requiredService',
      context.getHandler(),
    );

    if (!requiredService) {
      throw new ForbiddenException('No se especificó un servicio requerido para esta ruta');
    }

    const service = await this.prisma.service.findFirst({
      where: { name: requiredService, isActive: true },
    });

    if (!service) {
      throw new ForbiddenException(`El servicio "${requiredService}" no está registrado o no está activo`);
    }
    
    const hasPermission = await this.prisma.rolePermission.findFirst({
      where: {
        role: { id: user.roleId, isActive: true },
        permission: { servicePermissions: { some: { serviceId: service.id, isActive: true } } },
        isActive: true,
      },
    });

    if (!hasPermission) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso');
    }

    return true;
  }
}