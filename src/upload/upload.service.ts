import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { IpaParserService } from '../services/ipa-parser.service';
import { QrGeneratorService } from '../services/qr-generator.service';
import { STORAGE_SERVICE, IStorageService } from '../common/interfaces/storage.interface';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ipaParser: IpaParserService,
    private readonly qrGenerator: QrGeneratorService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
  ) {}

  async processUpload(file: Express.Multer.File, uploadId: string) {
    const baseUrl = this.configService.get<string>('app.baseUrl');
    const storageType = this.configService.get<string>('app.storageType', 'local');
    const outputDir = path.dirname(file.path);

    try {
      // Step 1: Parse IPA from the local temp/upload directory
      const metadata = await this.ipaParser.parseIPA(file.path, outputDir);

      // Step 2: Build URLs and QR code
      const installUrl = `${baseUrl}/app/${uploadId}`;
      const itmsLink = `itms-services://?action=download-manifest&url=${encodeURIComponent(`${baseUrl}/api/manifest/${uploadId}`)}`;
      const qrCode = await this.qrGenerator.generateQRDataURL(installUrl);

      // Step 3: Enrich metadata
      metadata.id = uploadId;
      metadata.installUrl = installUrl;
      metadata.itmsLink = itmsLink;
      metadata.uploadedAt = new Date().toISOString();
      metadata.fileSize = file.size;

      const metadataJson = JSON.stringify(metadata, null, 2);

      // Step 4: Persist files to storage
      if (storageType === 's3') {
        // Upload metadata + icon first (small files, needed for QR/install page).
        // These run in parallel for speed.
        const smallUploads: Promise<void>[] = [];

        smallUploads.push(
          this.storageService.saveFile(
            `${uploadId}/metadata.json`,
            Buffer.from(metadataJson, 'utf-8'),
            'application/json',
          ),
        );

        const iconPath = path.join(outputDir, 'icon.png');
        if (fs.existsSync(iconPath)) {
          const iconBuffer = fs.readFileSync(iconPath);
          smallUploads.push(
            this.storageService.saveFile(
              `${uploadId}/icon.png`,
              iconBuffer,
              'image/png',
            ),
          );
        }

        await Promise.all(smallUploads);

        // Upload the large IPA file in the background — don't block the response.
        // The user gets the QR code immediately. The IPA will be available by the
        // time they scan the QR and tap "Install" (typically 5-10+ seconds later).
        const ipaPath = path.join(outputDir, 'app.ipa');
        this.uploadIpaInBackground(uploadId, ipaPath, outputDir);
      } else {
        // For local mode, just write the enriched metadata (files already in place)
        fs.writeFileSync(path.join(outputDir, 'metadata.json'), metadataJson);
      }

      return {
        success: true,
        id: uploadId,
        metadata,
        installUrl,
        itmsLink,
        qrCode,
        iconUrl: `${baseUrl}/api/icon/${uploadId}`,
      };
    } catch (err) {
      this.logger.error('Upload processing error:', err);

      // Clean up on error
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      // Also attempt to clean up S3 if anything was partially uploaded
      try {
        await this.storageService.deleteDirectory(uploadId);
      } catch {
        // Ignore cleanup errors
      }

      throw err;
    }
  }

  /**
   * Uploads the IPA file to S3 in the background and cleans up the temp
   * directory when done. Errors are logged but do not affect the user response.
   */
  private uploadIpaInBackground(
    uploadId: string,
    ipaPath: string,
    tempDir: string,
  ): void {
    const ipaStream = fs.createReadStream(ipaPath);

    this.storageService
      .saveFile(`${uploadId}/app.ipa`, ipaStream, 'application/octet-stream')
      .then(() => {
        this.logger.log(`Background IPA upload complete: ${uploadId}`);
      })
      .catch((err) => {
        this.logger.error(`Background IPA upload failed for ${uploadId}:`, err);
      })
      .finally(() => {
        // Clean up temp directory regardless of success/failure
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup errors
        }
      });
  }
}
