import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class StorageService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'venues');

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

    // Ensure uploads/venues directory exists
    await fs.mkdir(this.uploadDir, { recursive: true });

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueSuffix = randomBytes(8).toString('hex');
    const filename = `venue-${venueId}-${Date.now()}-${uniqueSuffix}${ext}`;
    const filePath = path.join(this.uploadDir, filename);

    await fs.writeFile(filePath, file.buffer);

    return `/uploads/venues/${filename}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      if (!fileUrl.startsWith('/uploads/')) {
        return;
      }

      const relativePath = fileUrl.replace(/^\/+/, '');
      const fullPath = path.join(process.cwd(), relativePath);

      await fs.unlink(fullPath);
    } catch (err: any) {
      // Ignore if file already doesn't exist on disk
      if (err.code !== 'ENOENT') {
        console.warn(`Could not delete file ${fileUrl}:`, err.message);
      }
    }
  }
}
