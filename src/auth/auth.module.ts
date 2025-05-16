import { Module, Provider } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseStrategy } from './supabase.strategy';
import { JwtStrategy } from './jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { SUPABASE_CLIENT } from './auth.constants';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseProvider: Provider = {
  provide: SUPABASE_CLIENT,
  useFactory: (configService: ConfigService): SupabaseClient => {
    const supabaseUrl = configService.get<string>('SUPABASE_URL');
    const supabaseKey = configService.get<string>('SUPABASE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_KEY environment variables',
      );
    }

    return createClient(supabaseUrl, supabaseKey);
  },
  inject: [ConfigService],
};

@Module({
  imports: [PassportModule],
  providers: [AuthService, SupabaseStrategy, supabaseProvider, JwtStrategy],
  exports: [AuthService, SupabaseStrategy, SUPABASE_CLIENT],
  controllers: [AuthController],
})
export class AuthModule {}
