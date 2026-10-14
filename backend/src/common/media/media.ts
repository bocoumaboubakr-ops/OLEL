import { createHmac, timingSafeEqual } from 'crypto';
import { join } from 'path';

/**
 * Médias (photos, vocaux) — audit F12.
 *
 * - Le type est déterminé par le CONTENU (signature binaire), jamais par le
 *   type MIME ou le nom fournis par le client ; l'extension est imposée.
 * - Les fichiers ne sont plus servis publiquement : la forme stockée est
 *   canonique (`/uploads/<uuid>.<ext>`) et n'est jamais une adresse
 *   accessible. Les réponses authentifiées la remplacent par une URL signée
 *   à durée courte (`/api/v1/media/<fichier>?exp=…&sig=…`), utilisable dans
 *   une balise <img>/<audio> sans exposer le jeton de session.
 */

export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
export const MEDIA_URL_TTL_S = Number(process.env.MEDIA_URL_TTL_S ?? 3600);

export type MediaKind = 'image' | 'audio';
export interface SniffedMedia { kind: MediaKind; ext: string; mime: string }

export const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
  webm: 'audio/webm', amr: 'audio/amr', '3gp': 'audio/3gpp',
};

/**
 * Nom de fichier OLEL : UUID aléatoire + extension. Les nouveaux dépôts ont
 * une extension imposée (MIME_BY_EXT) ; les fichiers antérieurs à la
 * correction peuvent porter l'extension du nom d'origine (.jpeg, .heic,
 * .mp4…) ou aucune : ils restent lisibles, avec un type déterminé par le
 * contenu au moment de servir.
 */
const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,5})?$/;
/** Forme stockée, éventuellement préfixée d'une origine (données antérieures). */
const STORED_RE = /^(?:https?:\/\/[^/\s]+)?\/uploads\/([^/?#\s]+)$/;
/** URL signée renvoyée par l'API (rejouée par un client dans un formulaire). */
const SIGNED_RE = /^(?:https?:\/\/[^/\s]+)?\/api\/v1\/media\/([^/?#\s]+)(?:\?.*)?$/;

export const isMediaFileName = (f: string) => FILE_RE.test(f);

/** Nom de fichier OLEL désigné par une URL (stockée ou signée), sinon null. */
export function mediaFileOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m = STORED_RE.exec(url) || SIGNED_RE.exec(url);
  return m && FILE_RE.test(m[1]) ? m[1] : null;
}

export const canonicalMediaUrl = (file: string) => `/uploads/${file}`;

/** Forme canonique si l'URL désigne un média OLEL ; sinon valeur inchangée (rejetée par la validation). */
export function canonicalizeMedia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeMedia);
  const f = mediaFileOf(value);
  return f ? canonicalMediaUrl(f) : value;
}

export const CANONICAL_MEDIA_RE = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,5})?$/;

function key(): string {
  const k = process.env.MEDIA_URL_SECRET || process.env.JWT_SECRET;
  if (!k) throw new Error('MEDIA_URL_SECRET (ou JWT_SECRET) requis pour signer les médias');
  return k;
}

const sign = (file: string, exp: number) => createHmac('sha256', key()).update(`media:${file}:${exp}`).digest('base64url');

function publicBase(): string {
  return (process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`)
    .replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

export function signedMediaUrl(file: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MEDIA_URL_TTL_S;
  return `${publicBase()}/api/v1/media/${file}?exp=${exp}&sig=${sign(file, exp)}`;
}

export function verifyMediaSignature(file: string, exp: string | undefined, sig: string | undefined, now = Date.now()): boolean {
  const e = Number(exp);
  if (!FILE_RE.test(file) || !Number.isInteger(e) || !sig) return false;
  if (e * 1000 < now) return false;
  const expected = Buffer.from(sign(file, e));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Remplace, dans une réponse, chaque référence de média stockée par une URL signée. */
export function signMediaIn<T>(value: T, depth = 0): T {
  if (depth > 10 || value == null) return value;
  if (typeof value === 'string') {
    const m = STORED_RE.exec(value);
    return (m && FILE_RE.test(m[1]) ? signedMediaUrl(m[1]) : value) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => signMediaIn(v, depth + 1)) as unknown as T;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = signMediaIn(v, depth + 1);
    return out as T;
  }
  return value;
}

const startsWith = (b: Buffer, bytes: number[], offset = 0) => bytes.every((x, i) => b[offset + i] === x);
const ascii = (b: Buffer, s: string, offset = 0) => b.length >= offset + s.length && b.toString('latin1', offset, offset + s.length) === s;

/** Détermine le type réel d'après les premiers octets. null si non reconnu. */
export function sniffMedia(b: Buffer): SniffedMedia | null {
  if (!b || b.length < 12) return null;
  const media = (kind: MediaKind, ext: string): SniffedMedia => ({ kind, ext, mime: MIME_BY_EXT[ext] });
  if (startsWith(b, [0xff, 0xd8, 0xff])) return media('image', 'jpg');
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return media('image', 'png');
  if (ascii(b, 'RIFF') && ascii(b, 'WEBP', 8)) return media('image', 'webp');
  if (ascii(b, 'GIF87a') || ascii(b, 'GIF89a')) return media('image', 'gif');
  if (ascii(b, 'OggS')) return media('audio', 'ogg');
  if (ascii(b, '#!AMR')) return media('audio', 'amr');
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return media('audio', 'webm');
  if (ascii(b, 'ftyp', 4)) {
    const brand = b.toString('latin1', 8, 12);
    if (brand.startsWith('3gp') || brand.startsWith('3g2')) return media('audio', '3gp');
    if (['M4A ', 'M4B ', 'mp42', 'isom', 'mp41', 'iso2', 'dash'].includes(brand)) return media('audio', 'm4a');
    return null;
  }
  if (ascii(b, 'ID3') || (b[0] === 0xff && (b[1] & 0xe6) === 0xe2)) return media('audio', 'mp3');
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return media('audio', 'aac');
  return null;
}
