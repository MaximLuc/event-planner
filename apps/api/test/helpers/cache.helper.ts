import type { INestApplication } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

export async function cleanCache(app: INestApplication): Promise<void> {
  const cache = app.get<Cache>(CACHE_MANAGER);

  await cache.clear();
}
