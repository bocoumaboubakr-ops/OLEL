import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { open, stat } from 'fs/promises';
import { join } from 'path';
import { UPLOAD_DIR, sniffMedia, verifyMediaSignature } from './media';

/**
 * Lecture d'un média par URL signée (audit F12). Pas de jeton de session :
 * l'URL n'est émise que dans une réponse authentifiée et expire
 * (MEDIA_URL_TTL_S, 1 h par défaut). Aucune liste, aucun accès par nom seul.
 */
@ApiExcludeController()
@SkipThrottle() // limitation assurée par Nginx ; la signature est infalsifiable
@Controller('media')
export class MediaController {
  @Get(':file')
  async get(@Param('file') file: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!verifyMediaSignature(file, exp, sig)) throw new ForbiddenException('Lien de média invalide ou expiré');
    const path = join(UPLOAD_DIR, file);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException('Média introuvable');
    // Type déterminé par le contenu (y compris pour les fichiers antérieurs à
    // la correction) ; un contenu non reconnu n'est jamais rendu dans la page.
    const head = Buffer.alloc(32);
    const fh = await open(path, 'r');
    try { await fh.read(head, 0, 32, 0); } finally { await fh.close(); }
    const media = sniffMedia(head);
    const remaining = Math.max(0, Number(exp) - Math.floor(Date.now() / 1000));
    res.set({
      'Content-Type': media?.mime ?? 'application/octet-stream',
      'Content-Length': String(info.size),
      'Content-Disposition': media ? 'inline' : 'attachment',
      'Cache-Control': `private, max-age=${remaining}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // Tableau de bord et mobile sont sur des sous-domaines du même site
      'Cross-Origin-Resource-Policy': 'same-site',
    });
    createReadStream(path).pipe(res);
  }
}
