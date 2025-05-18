import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';

@Injectable()
export class CacheService {

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) { }

  async get(key: string): Promise<any> {
    return await this.cache.get(key);
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cache.set(key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.cache.del(key);
  }

}
