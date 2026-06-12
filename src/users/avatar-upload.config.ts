import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';

export const AVATAR_UPLOAD_DIR = './uploads/avatars';

mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const avatarUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: AVATAR_UPLOAD_DIR,
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(
        new BadRequestException(
          'Only JPEG, PNG, WEBP, and GIF images are allowed',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
};
