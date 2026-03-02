import { Injectable, Logger } from '@nestjs/common';
import * as yauzl from 'yauzl';
import * as plist from 'plist';
import * as bplistParser from 'bplist-parser';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { IAppMetadata } from '../common/interfaces/app-metadata.interface';

@Injectable()
export class IpaParserService {
  private readonly logger = new Logger(IpaParserService.name);

  parseIPA(ipaPath: string, outputDir: string): Promise<IAppMetadata> {
    return new Promise((resolve, reject) => {
      yauzl.open(ipaPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);

        let infoPlistBuffer: Buffer | null = null;
        let appDirName: string | null = null;
        const entries: string[] = [];

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          const dirMatch = entry.fileName.match(/^Payload\/([^/]+\.app)\//);
          if (dirMatch && !appDirName) {
            appDirName = dirMatch[1];
          }

          entries.push(entry.fileName);

          if (/^Payload\/[^/]+\.app\/Info\.plist$/.test(entry.fileName)) {
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) return reject(err);
              const chunks: Buffer[] = [];
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', () => {
                infoPlistBuffer = Buffer.concat(chunks);
                zipfile.readEntry();
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', async () => {
          if (!infoPlistBuffer) {
            return reject(new Error('Info.plist not found in IPA'));
          }

          // Parse plist — try binary first (more common in modern IPAs), then XML
          let infoPlist: any;
          try {
            const parsed = bplistParser.parseBuffer(infoPlistBuffer);
            infoPlist = parsed[0];
          } catch {
            try {
              infoPlist = plist.parse(infoPlistBuffer.toString('utf8'));
            } catch {
              return reject(
                new Error(
                  'Could not parse Info.plist (tried binary and XML formats)',
                ),
              );
            }
          }

          const metadata: IAppMetadata = {
            name:
              infoPlist.CFBundleDisplayName ||
              infoPlist.CFBundleName ||
              'Unknown App',
            bundleId:
              infoPlist.CFBundleIdentifier || 'unknown.bundle.id',
            version:
              infoPlist.CFBundleShortVersionString ||
              infoPlist.CFBundleVersion ||
              '1.0',
            buildNumber: infoPlist.CFBundleVersion || '1',
            minimumOSVersion: infoPlist.MinimumOSVersion || 'N/A',
          };

          // Determine icon filename from plist
          let iconBaseName: string | null = null;
          const icons = infoPlist.CFBundleIcons;
          if (icons?.CFBundlePrimaryIcon?.CFBundleIconFiles) {
            const iconFiles =
              icons.CFBundlePrimaryIcon.CFBundleIconFiles;
            iconBaseName = iconFiles[iconFiles.length - 1];
          }

          // Also check iPad icons
          if (!iconBaseName) {
            const iPadIcons = infoPlist['CFBundleIcons~ipad'];
            if (iPadIcons?.CFBundlePrimaryIcon?.CFBundleIconFiles) {
              const iconFiles =
                iPadIcons.CFBundlePrimaryIcon.CFBundleIconFiles;
              iconBaseName = iconFiles[iconFiles.length - 1];
            }
          }

          // Legacy icon key fallback
          if (!iconBaseName && infoPlist.CFBundleIconFile) {
            iconBaseName = infoPlist.CFBundleIconFile;
          }

          // Save metadata
          fs.writeFileSync(
            path.join(outputDir, 'metadata.json'),
            JSON.stringify(metadata, null, 2),
          );

          // Extract icon if we found a name
          if (iconBaseName && appDirName) {
            try {
              await this.extractIcon(
                ipaPath,
                appDirName,
                iconBaseName,
                entries,
                outputDir,
              );
            } catch (iconErr: any) {
              this.logger.warn(
                `Could not extract icon: ${iconErr.message}`,
              );
            }
          }

          resolve(metadata);
        });

        zipfile.on('error', reject);
      });
    });
  }

  private extractIcon(
    ipaPath: string,
    appDirName: string,
    iconBaseName: string,
    entryNames: string[],
    outputDir: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const prefix = `Payload/${appDirName}/${iconBaseName}`;
      const candidates = [
        `${prefix}@3x.png`,
        `${prefix}@2x.png`,
        `${prefix}.png`,
        `${prefix}@3x~iphone.png`,
        `${prefix}@2x~iphone.png`,
      ];

      let targetEntry: string | null = null;
      for (const candidate of candidates) {
        if (entryNames.includes(candidate)) {
          targetEntry = candidate;
          break;
        }
      }

      if (!targetEntry) {
        const matching = entryNames
          .filter(
            (name) =>
              name.startsWith(prefix) && name.endsWith('.png'),
          )
          .sort((a, b) => b.length - a.length);
        if (matching.length > 0) {
          targetEntry = matching[0];
        }
      }

      if (!targetEntry) {
        return reject(
          new Error(
            `Icon file not found for base name: ${iconBaseName}`,
          ),
        );
      }

      const target = targetEntry;

      yauzl.open(ipaPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (entry.fileName === target) {
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) return reject(err);
              const chunks: Buffer[] = [];
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', async () => {
                let iconBuffer: Buffer = Buffer.concat(chunks);
                const outputPath = path.join(outputDir, 'icon.png');

                // Convert Apple CgBI PNG to standard PNG if needed
                if (this.isCgBIPng(iconBuffer)) {
                  this.logger.log(
                    'Detected CgBI PNG icon, converting to standard PNG...',
                  );
                  try {
                    iconBuffer = this.convertCgBI(iconBuffer);
                  } catch (cgbiErr: any) {
                    this.logger.warn(
                      `CgBI conversion failed: ${cgbiErr.message}`,
                    );
                  }
                }

                try {
                  await sharp(iconBuffer)
                    .resize(256, 256)
                    .png()
                    .toFile(outputPath);
                } catch (sharpErr: any) {
                  this.logger.warn(
                    `sharp could not process icon, saving converted buffer: ${sharpErr.message}`,
                  );
                  fs.writeFileSync(outputPath, iconBuffer);
                }

                resolve(outputPath);
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          reject(
            new Error('Icon entry not found during extraction pass'),
          );
        });

        zipfile.on('error', reject);
      });
    });
  }

  /**
   * Detect Apple's CgBI PNG format.
   * CgBI PNGs have a non-standard 'CgBI' chunk right after the PNG signature.
   */
  private isCgBIPng(buffer: Buffer): boolean {
    if (buffer.length < 16) return false;
    // PNG signature (8 bytes), then first chunk: 4 bytes length + 4 bytes type
    return buffer.toString('ascii', 12, 16) === 'CgBI';
  }

  /**
   * Convert Apple CgBI PNG to standard PNG.
   *
   * CgBI differences from standard PNG:
   * - Extra 'CgBI' chunk before IHDR
   * - IDAT data uses raw deflate (no zlib header/checksum)
   * - Pixel channels are BGRA instead of RGBA
   */
  private convertCgBI(buffer: Buffer): Buffer {
    const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let isCgBI = false;
    const idatBuffers: Buffer[] = [];

    interface PngChunk {
      type: string;
      data: Buffer;
    }
    const otherChunks: PngChunk[] = [];

    // Parse all PNG chunks
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);

      if (offset + 12 + length > buffer.length) break;

      const data = buffer.slice(offset + 8, offset + 8 + length);

      if (type === 'CgBI') {
        isCgBI = true;
      } else if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        otherChunks.push({ type, data });
      } else if (type === 'IDAT') {
        idatBuffers.push(data);
      } else {
        otherChunks.push({ type, data });
      }

      offset += 12 + length;
    }

    if (!isCgBI) return buffer;

    // Decompress IDAT data — CgBI uses raw deflate (no zlib header)
    const combinedIDAT = Buffer.concat(idatBuffers);
    let rawPixels: Buffer;
    try {
      rawPixels = zlib.inflateRawSync(combinedIDAT);
    } catch {
      this.logger.warn('CgBI inflateRaw failed, returning original');
      return buffer;
    }

    // Determine bytes per pixel
    let bytesPerPixel: number;
    if (colorType === 6) bytesPerPixel = 4; // RGBA
    else if (colorType === 2) bytesPerPixel = 3; // RGB
    else if (colorType === 4) bytesPerPixel = 2; // Greyscale+Alpha
    else return buffer;

    if (bitDepth === 16) bytesPerPixel *= 2;

    const rowBytes = 1 + width * bytesPerPixel;

    // Swap B and R channels (CgBI stores BGRA, standard uses RGBA)
    if (colorType === 6 || colorType === 2) {
      for (let y = 0; y < height; y++) {
        const rowStart = y * rowBytes + 1;
        for (let x = 0; x < width; x++) {
          const px = rowStart + x * bytesPerPixel;
          if (px + 2 < rawPixels.length) {
            const tmp = rawPixels[px];
            rawPixels[px] = rawPixels[px + 2];
            rawPixels[px + 2] = tmp;
          }
        }
      }
    }

    // Recompress with proper zlib (includes header + checksum)
    const newIDATData = zlib.deflateSync(rawPixels);

    // Rebuild PNG file
    const parts: Buffer[] = [PNG_SIG];

    // IHDR must come first
    const ihdr = otherChunks.find((c) => c.type === 'IHDR');
    if (ihdr) {
      parts.push(this.buildPngChunk('IHDR', ihdr.data));
    }

    // Other chunks (skip IHDR and IEND)
    for (const chunk of otherChunks) {
      if (chunk.type !== 'IHDR' && chunk.type !== 'IEND') {
        parts.push(this.buildPngChunk(chunk.type, chunk.data));
      }
    }

    // New IDAT with properly compressed data
    parts.push(this.buildPngChunk('IDAT', newIDATData));

    // IEND
    parts.push(this.buildPngChunk('IEND', Buffer.alloc(0)));

    return Buffer.concat(parts);
  }

  private buildPngChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(this.crc32(crcInput));
    return Buffer.concat([length, typeBuffer, data, crc]);
  }

  private crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xedb88320;
        } else {
          crc >>>= 1;
        }
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}
