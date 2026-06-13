/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS ?? 'http://localhost:4200,http://localhost:4000'
    ).split(','),
    credentials: true,
  });
  const port = process.env.PORT || 3000;
  // Bind dual-stack (IPv6 `::`, which also accepts IPv4) so the app is reachable
  // over Railway's private network — `<service>.railway.internal` resolves to
  // IPv6, and an IPv4-only bind (the bare `listen(port)` default) is refused by
  // sibling services even though the localhost healthcheck still passes.
  await app.listen(port, '::');
  Logger.log(
    `Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
