import { repl } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  await repl(AppModule);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
