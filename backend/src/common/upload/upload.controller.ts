import { Controller, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody, ApiHeader } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BotApiKeyGuard } from '../guards/bot-api-key.guard';
import { SkipThrottle } from '@nestjs/throttler';
import { MediaKind, UPLOAD_DIR, canonicalMediaUrl, sniffMedia } from '../media/media';

const IMAGE_MAX = 10 * 1024 * 1024; // 10 MB
const AUDIO_MAX = 16 * 1024 * 1024; // 16 MB (~limite média WhatsApp)

mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o750 });

/** Réception en mémoire (taille bornée) : le fichier n'est écrit qu'après vérification du contenu. */
const receive = (maxSize: number) => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: maxSize, files: 1 } });

/**
 * Upload de médias — audit F12.
 * Le type MIME et le nom fournis par le client sont ignorés : le contenu est
 * identifié par sa signature binaire, l'extension est imposée, le nom est
 * aléatoire. La réponse contient la référence canonique ; pour un appel
 * authentifié, elle est convertie en URL signée à durée courte.
 */
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  private async store(file: Express.Multer.File | undefined, allowed: MediaKind[]) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier fourni');
    const media = sniffMedia(file.buffer);
    if (!media || !allowed.includes(media.kind)) {
      throw new BadRequestException(`Contenu non reconnu comme ${allowed.join(' ou ')} (formats acceptés : JPEG, PNG, WEBP, GIF, OGG, MP3, M4A, AAC, WEBM, AMR, 3GP)`);
    }
    const filename = `${randomUUID()}.${media.ext}`;
    await writeFile(join(UPLOAD_DIR, filename), file.buffer, { mode: 0o640, flag: 'wx' });
    return { url: canonicalMediaUrl(filename), filename, size: file.size, mimetype: media.mime, kind: media.kind };
  }

  @Post('photo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload d\'une photo (max 10 MB, JPEG/PNG/WEBP/GIF — contenu vérifié)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(receive(IMAGE_MAX))
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    return this.store(file, ['image']);
  }

  @Post('audio')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload d\'un message vocal (max 16 MB, ogg/mp3/m4a/webm/amr — contenu vérifié)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(receive(AUDIO_MAX))
  uploadAudio(@UploadedFile() file: Express.Multer.File) {
    return this.store(file, ['audio']);
  }

  @Post('bot-media')
  @SkipThrottle()
  @ApiHeader({ name: 'x-bot-api-key', description: 'Clé API du bot' })
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Upload média par le bot (image ou audio WhatsApp — contenu vérifié)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(receive(AUDIO_MAX))
  uploadBotMedia(@UploadedFile() file: Express.Multer.File) {
    return this.store(file, ['image', 'audio']);
  }
}
