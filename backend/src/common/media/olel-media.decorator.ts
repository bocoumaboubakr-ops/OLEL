import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, Matches } from 'class-validator';
import { CANONICAL_MEDIA_RE, canonicalizeMedia } from './media';

const MESSAGE = 'Seuls les médias déposés via /upload sont acceptés';

/**
 * Champ média (audit F12) : accepte une référence stockée ou une URL signée
 * renvoyée par l'API, la ramène à la forme canonique `/uploads/<fichier>`,
 * et refuse toute adresse externe (pixel de suivi, contenu non vérifié).
 */
export const IsOlelMediaList = (max = 10) => applyDecorators(
  Transform(({ value }) => canonicalizeMedia(value)),
  IsArray(),
  ArrayMaxSize(max),
  IsString({ each: true }),
  Matches(CANONICAL_MEDIA_RE, { each: true, message: MESSAGE }),
);

export const IsOlelMedia = () => applyDecorators(
  Transform(({ value }) => canonicalizeMedia(value)),
  IsString(),
  Matches(CANONICAL_MEDIA_RE, { message: MESSAGE }),
);
