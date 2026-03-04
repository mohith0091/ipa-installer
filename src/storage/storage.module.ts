import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE } from '../common/interfaces/storage.interface';
import { LocalStorageService } from '../services/local-storage.service';
import { S3StorageService } from '../services/s3-storage.service';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: (configService: ConfigService) => {
        const storageType = configService.get<string>('app.storageType', 'local');
        if (storageType === 's3') {
          const s3Service = new S3StorageService(configService);
          s3Service.onModuleInit();
          return s3Service;
        }
        return new LocalStorageService(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
