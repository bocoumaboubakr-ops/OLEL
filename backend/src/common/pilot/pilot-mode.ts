/**
 * Mode pilote (étape 2 de la mise en service) : tant que
 * PILOT_RECIPIENT_ALLOWLIST est défini, AUCUN message de diffusion ne part
 * vers un numéro absent de cette liste (numéros de l'équipe et volontaires
 * ayant donné leur accord). La règle est appliquée par le processeur de
 * diffusion, côté serveur : aucune action d'interface ne peut la lever.
 *
 * La même liste borne la CONSULTATION : en mode pilote, seuls ces numéros
 * voient les alertes diffusées (application, USSD, bot, temps réel, radios
 * partenaires). Sinon une alerte d'essai serait visible du public.
 *
 * Format : numéros E.164 séparés par des virgules ou des espaces.
 * Variable absente ou vide = fonctionnement normal (aucune restriction).
 */
export function normalizeE164(phone: string): string {
  const digits = String(phone).replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export function pilotAllowlist(): Set<string> | null {
  const raw = process.env.PILOT_RECIPIENT_ALLOWLIST?.trim();
  if (!raw) return null;
  const set = new Set(raw.split(/[\s,;]+/).filter(Boolean).map(normalizeE164));
  return set.size ? set : null;
}

export function pilotModeInfo() {
  const list = pilotAllowlist();
  return { pilotMode: !!list, allowlistSize: list?.size ?? 0 };
}

/** Vrai si ce numéro peut voir les alertes diffusées (toujours vrai hors mode pilote). */
export function pilotAudienceAllowed(phone?: string | null): boolean {
  const list = pilotAllowlist();
  if (!list) return true;
  return !!phone && list.has(normalizeE164(phone));
}

/** Code renvoyé aux canaux de consultation fermés pendant le pilote. */
export const PILOT_CONSULTATION_CLOSED = 'PILOT_CONSULTATION_CLOSED';
