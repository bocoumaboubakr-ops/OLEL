import { Controller, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody, ApiHeader } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BotApiKeyGuard } from '../guards/bot-api-key.guard';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// WhatsApp envoie de l'audio en ogg/opus ; MediaRecorder mobile en webm/mp4.
const AUDIO_MIMES = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/amr', 'audio/3gpp', 'audio/x-m4a'];
const IMAGE_MAX = 10 * 1024 * 1024; // 10 MB
const AUDIO_MAX = 16 * 1024 * 1024; // 16 MB (~limite média WhatsApp)

mkdirSync(UPLOAD_DIR, { recursive: true });

function publicUrl(filename: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || `http://localhost:${process.env.PORT || 4000}`;
  return `${base}/uploads/${filename}`;
}

function buildInterceptor(allowed: string[], maxSize: number) {
  return FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || guessExt(file.mimetype)}`),
    }),
    limits: { fileSize: maxSize },
    fileFilter: (_req, file, cb) => {
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new BadRequestException(`Format non supporté : ${file.mimetype}`), false);
    },
  });
}

function guessExt(mimetype: string): string {
  const map: Record<string, string> = {
    'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
    'audio/webm': '.webm', 'audio/amr': '.amr', 'audio/3gpp': '.3gp', 'audio/x-m4a': '.m4a',
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  };
  return map[mimetype] || '';
}

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  @Post('photo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload d\'une photo (max 10 MB, JPEG/PNG/WEBP/GIF)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(buildInterceptor(IMAGE_MIMES, IMAGE_MAX))
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    return { url: publicUrl(file.filename), filename: file.filename, size: file.size, mimetype: file.mimetype };
  }

  @Post('audio')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload d\'un message vocal (max 16 MB, ogg/mp3/m4a/webm)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(buildInterceptor(AUDIO_MIMES, AUDIO_MAX))
  uploadAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    return { url: publicUrl(file.filename), filename: file.filename, size: file.size, mimetype: file.mimetype };
  }

  @Post('bot-media')
  @ApiHeader({ name: 'x-bot-api-key', description: 'Clé API du bot' })
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Upload média par le bot (image ou audio WhatsApp)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(buildInterceptor([...IMAGE_MIMES, ...AUDIO_MIMES], AUDIO_MAX))
  uploadBotMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    return { url: publicUrl(file.filename), filename: file.filename, size: file.size, mimetype: file.mimetype };
  }
}
