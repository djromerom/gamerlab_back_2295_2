// src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  // Podrías compartir este tipo
  sub: string;
  email?: string;
  // ... otros campos que esperes
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  // Nombre 'jwt'
  constructor(
    private configService: ConfigService,
    // Quizás no necesites AuthService aquí si solo validas el payload estándar
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Extrae de Header
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('SUPABASE_JWT_SECRET'), // Mismo secreto
    });
  }

  async validate(payload: JwtPayload): Promise<any> {
    // Devuelve lo que quieras en req.user
    // Aquí puedes simplemente devolver el payload si no necesitas sincronizar con DB local
    // O puedes llamar a un servicio para buscar/validar el usuario localmente
    console.log('JwtStrategy validated payload:', payload);
    return { sub: payload.sub, email: payload.email /* , etc */ };
    // O si necesitas el usuario completo de Prisma como en SupabaseStrategy:
    // const user = await this.userService.findUserBySupabaseId(payload.sub);
    // if (!user) throw new UnauthorizedException();
    // return user; // Adaptar según necesidad
  }
}
