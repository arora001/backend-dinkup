import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'venues');

  private readonly s3Client?: S3Client;
  private readonly s3Bucket?: string;
  private readonly s3Endpoint?: string;
  private readonly s3PublicUrl?: string;
  private readonly isS3Configured: boolean;

  constructor(configService: ConfigService) {
    const endpoint = configService.get<string>('S3_ENDPOINT');
    const bucket = configService.get<string>('S3_BUCKET');
    const accessKeyId = configService.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = configService.get<string>('S3_SECRET_KEY');
    const publicUrl = configService.get<string>('S3_PUBLIC_URL');

    if (endpoint && bucket && accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: 'auto', // Cloudflare R2 standard region
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.s3Bucket = bucket;
      this.s3Endpoint = endpoint.replace(/\/+$/, '');
      this.s3PublicUrl = publicUrl ? publicUrl.replace(/\/+$/, '') : undefined;
      this.isS3Configured = true;
      this.logger.log(`Cloudflare R2 storage initialized (Bucket: ${bucket})`);
    } else {
      this.isS3Configured = false;
      this.logger.log('S3/R2 credentials not set. Falling back to local disk storage (/uploads).');
    }
  }

  async saveVenueImage(venueId: number, file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file format. Allowed formats: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Image size exceeds 5 MB limit');
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueSuffix = randomBytes(8).toString('hex');
    const filename = `venue-${venueId}-${Date.now()}-${uniqueSuffix}${ext}`;

    // 1. Upload to Cloudflare R2 if configured
    if (this.isS3Configured && this.s3Client && this.s3Bucket) {
      const key = `venues/${filename}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      const baseUrl = this.s3PublicUrl || `${this.s3Endpoint}/${this.s3Bucket}`;
      return `${baseUrl}/${key}`;
    }

    // 2. Otherwise fall back to local disk storage
    await fs.mkdir(this.uploadDir, { recursive: true });
    const filePath = path.join(this.uploadDir, filename);
    await fs.writeFile(filePath, file.buffer);

    return `/uploads/venues/${filename}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // 1. If Cloudflare R2 URL
      if (this.isS3Configured && this.s3Client && this.s3Bucket && !fileUrl.startsWith('/uploads/')) {
        let key = fileUrl;
        if (this.s3PublicUrl && fileUrl.startsWith(this.s3PublicUrl)) {
          key = fileUrl.replace(`${this.s3PublicUrl}/`, '');
        } else if (this.s3Endpoint && fileUrl.startsWith(this.s3Endpoint)) {
          key = fileUrl.replace(`${this.s3Endpoint}/${this.s3Bucket}/`, '');
        }

        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.s3Bucket,
            Key: key,
          }),
        );
        return;
      }

      // 2. Local disk file
      if (fileUrl.startsWith('/uploads/')) {
        const relativePath = fileUrl.replace(/^\/+/, '');
        const fullPath = path.join(process.cwd(), relativePath);
        await fs.unlink(fullPath);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        this.logger.warn(`Could not delete file ${fileUrl}: ${err.message}`);
      }
    }
  }
}
