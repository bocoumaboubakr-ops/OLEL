/** Résultat d'un envoi fournisseur (audit F22). */
export interface SendResult {
  /** true : aucun envoi réel (environnement de test) — jamais compté comme envoyé. */
  simulated: boolean;
  /** Identifiant fournisseur, pour rapprocher les accusés de livraison. */
  providerMessageId?: string;
}

/** Canal non configuré : en production c'est une erreur, pas une simulation. */
export class ChannelNotConfiguredError extends Error {
  constructor(channel: string) {
    super(`Canal ${channel} non configuré`);
  }
}

/** Délai maximal des appels fournisseurs (audit F26). */
export const PROVIDER_TIMEOUT_MS = 10_000;
