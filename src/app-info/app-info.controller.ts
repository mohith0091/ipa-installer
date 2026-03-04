import { Controller, Get, Inject, Param, Res, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';

@Controller()
export class AppInfoController {
  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
  ) {}

  @Get('app/:id')
  serveInstallPage(@Res() res: Response): void {
    const installHtml = path.join(process.cwd(), 'public', 'install.html');
    res.sendFile(installHtml);
  }

  @Get('apps')
  serveAppsPage(@Res() res: Response): void {
    const appsHtml = path.join(process.cwd(), 'public', 'apps.html');
    res.sendFile(appsHtml);
  }

  @Get('api/app/:id')
  async getAppMetadata(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const metadataKey = `${id}/metadata.json`;

    const exists = await this.storageService.fileExists(metadataKey);
    if (!exists) {
      res.status(HttpStatus.NOT_FOUND).json({
        error: 'App not found or link has expired',
      });
      return;
    }

    const metadataBuffer = await this.storageService.readFile(metadataKey);
    const metadata = JSON.parse(metadataBuffer.toString('utf-8'));

    res.json({
      metadata,
      iconUrl: `${baseUrl}/api/icon/${id}`,
      itmsLink: `itms-services://?action=download-manifest&url=${encodeURIComponent(`${baseUrl}/api/manifest/${id}`)}`,
    });
  }

  @Get('api/icon/:id')
  async getIcon(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const iconKey = `${id}/icon.png`;
    const defaultIcon = path.join(process.cwd(), 'public', 'images', 'default-icon.png');

    res.set('Content-Type', 'image/png');

    const exists = await this.storageService.fileExists(iconKey);
    if (exists) {
      const stream = await this.storageService.readFileStream(iconKey);
      stream.pipe(res);
    } else {
      res.sendFile(path.resolve(defaultIcon));
    }
  }

  @Get('api/download/:id')
  async downloadIpa(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const ipaKey = `${id}/app.ipa`;

    const exists = await this.storageService.fileExists(ipaKey);
    if (!exists) {
      res.status(HttpStatus.NOT_FOUND).send('File not found');
      return;
    }

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="app.ipa"');

    const stream = await this.storageService.readFileStream(ipaKey);
    stream.pipe(res);
  }
}
