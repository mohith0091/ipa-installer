import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterOptionsFactory, MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Request } from 'express';

@Injectable()
export class MulterConfigService implements MulterOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createMulterOptions(): MulterModuleOptions {
    const storageType = this.configService.get<string>('app.storageType', 'local');
    const uploadDir = this.configService.get<string>('app.uploadDir', './uploads');
    const maxFileSize = this.configService.get<number>('app.maxFileSize', 524288000);

    // For S3 mode, use a temp directory. For local mode, write directly to uploadDir.
    const baseDir = storageType === 's3'
      ? path.join(os.tmpdir(), 'ipa-installer-tmp')
      : uploadDir;

    return {
      storage: diskStorage({
        destination: (req: Request & { uploadId?: string }, _file, cb) => {
          const id = uuidv4();
          req.uploadId = id;
          const dir = path.join(baseDir, id);
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, _file, cb) => {
          cb(null, 'app.ipa');
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.ipa')) {
          cb(null, true);
        } else {
          cb(new Error('Only .ipa files are allowed') as any, false);
        }
      },
      limits: { fileSize: maxFileSize },
    };
  }
}
