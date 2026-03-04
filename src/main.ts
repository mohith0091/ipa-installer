import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const storageType = configService.get<string>('app.storageType', 'local');

  // Ensure uploads directory exists for local storage
  if (storageType === 'local') {
    const uploadDir = configService.get<string>('app.uploadDir', './uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  // Set server timeout for large uploads (10 minutes)
  const server = app.getHttpServer();
  server.setTimeout(600000);

  await app.listen(port);
  console.log(`Server running at http://localhost:${port} (storage: ${storageType})`);
}
bootstrap();
