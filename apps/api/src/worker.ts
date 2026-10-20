import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  app.enableShutdownHooks();

  Logger.log(
    'Worker started and is waiting for notification jobs',
    'WorkerBootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
