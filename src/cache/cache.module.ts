import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheModule as Cache } from '@nestjs/cache-manager';

@Global()
@Module({
  imports: [Cache.register({ isGlobal: true })],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
