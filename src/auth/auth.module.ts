import { Module, Provider } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseStrategy } from './supabase.strategy';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { CacheModule } from 'src/cache/cache.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    PassportModule, 
    CacheModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  providers: [AuthService, SupabaseStrategy],
  exports: [AuthService, SupabaseStrategy],
  controllers: [AuthController],
})
export class AuthModule { }
