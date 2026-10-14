import { AlertLevel, AlertStatus, AlertStep, Role, ValidationAction } from '@prisma/client';
import {
  LEVEL_CONFIG, PHASE, canAdvanceAt, hasLevel, mayEmergencyBypass, needsConfirmation, normalizePhase,
} from './alert-workflow';

/**
 * Règles d'action sur une alerte — SOURCE UNIQUE côté serveur (audit F03,
 * F05, F14). Tous les chemins (advance, broadcast, bypass, auto-escalade,
 * pré-alerte) passent par ces fonctions ; un bouton masqué dans une
 * interface n'est jamais une protection.
 *
 * Chaque fonction renvoie `null` si l'action est permise, sinon la raison
 * du refus (message destiné à l'opérateur).
 */

/** États où plus aucune décision ni diffusion n'est possible. */
export const TERMINAL_STATUSES: AlertStatus[] = [
  AlertStatus.REJECTED, AlertStatus.CANCELLED, AlertStatus.CLOSED, AlertStatus.RESOLVED,
];
/** États déjà diffusés (ou en cours) : seule la clôture reste possible. */
export const DIFFUSED_STATUSES: AlertStatus[] = [AlertStatus.BROADCAST, AlertStatus.BROADCASTING];

/** Alertes publiques encore applicables (consultation citoyenne, bot, stats — audit F16). */
export const PUBLIC_ACTIVE_STATUSES: AlertStatus[] = [AlertStatus.BROADCAST, AlertStatus.BROADCASTING, AlertStatus.ACTIVE];

const LEVEL_ORDER: AlertLevel[] = [AlertLevel.BLEU, AlertLevel.JAUNE, AlertLevel.ORANGE, AlertLevel.ROUGE, AlertLevel.ROUGE_FONCE];
export const maxLevel = (a: AlertLevel, b: AlertLevel) =>
  LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;

/**
 * Niveau qui détermine l'autorité requise ET le parcours d'une décision :
 * le plus élevé du niveau actuel et du niveau proposé (audit F05).
 */
export const routingLevel = (current: AlertLevel, requested?: AlertLevel) =>
  requested ? maxLevel(current, requested) : current;

export interface AlertFacts {
  status: AlertStatus;
  currentStep: AlertStep;
  alertLevel: AlertLevel;
  broadcastAt: Date | null;
  requiresMedicalReview: boolean;
  createdById: string;
  /** Identifiants des personnes ayant déjà validé une étape de cette alerte. */
  priorValidatorIds: string[];
}

export interface Actor { id: string; role: Role }

const isOpen = (a: AlertFacts) => !TERMINAL_STATUSES.includes(a.status) && !DIFFUSED_STATUSES.includes(a.status) && !a.broadcastAt;

/**
 * Règle des deux personnes (audit F05) : pour ROUGE/ROUGE_FONCE, la personne
 * qui déclenche la diffusion ne peut être ni l'auteur de l'alerte, ni une
 * personne ayant déjà validé une étape.
 */
export function fourEyesViolation(a: AlertFacts, actor: Actor, level: AlertLevel): string | null {
  if (!needsConfirmation(level)) return null;
  if (actor.id === a.createdById || a.priorValidatorIds.includes(actor.id)) {
    return 'Niveau ROUGE/ROUGE_FONCE : la diffusion doit être confirmée par une autre personne que l\'auteur et les validateurs précédents';
  }
  return null;
}

export function refuseAdvance(a: AlertFacts, actor: Actor, action: ValidationAction, requestedLevel?: AlertLevel): string | null {
  if (!isOpen(a)) return `Alerte non modifiable (statut ${a.status})`;
  const phase = normalizePhase(a.currentStep);
  if (phase === PHASE.DIFFUSEE || phase === PHASE.CLOTUREE) return 'Étape terminale';
  if (actor.role === Role.RADIO_COMMUNAUTAIRE || actor.role === Role.CITOYEN) return 'Rôle non habilité à valider une alerte';

  // Changer le niveau exige l'autorité du PLUS ÉLEVÉ des deux niveaux :
  // abaisser ROUGE → ORANGE ne permet pas d'éviter la confirmation.
  const authorityLevel = routingLevel(a.alertLevel, requestedLevel);
  // Le rejet exige la même autorité que la validation à cette étape.
  if (!canAdvanceAt(actor.role, a.currentStep, authorityLevel)) {
    return `Rôle ${actor.role} insuffisant pour cette décision (étape ${phase}, niveau ${authorityLevel})`;
  }
  if (action === ValidationAction.REJECTED) return null;

  const effectiveLevel = requestedLevel ?? a.alertLevel;
  // Le parcours suit aussi le niveau le plus élevé : une alerte ROUGE abaissée
  // à l'étape VÉRIFIÉE passe quand même par la confirmation de l'autorité.
  const willDiffuse = phase === PHASE.CONFIRMEE || (phase === PHASE.VERIFIEE && !needsConfirmation(authorityLevel));
  if (willDiffuse) {
    if (a.requiresMedicalReview) return 'Revue médicale requise avant toute diffusion (épidémie)';
    const minRole = LEVEL_CONFIG[effectiveLevel].minBroadcastRole;
    if (!hasLevel(actor.role, minRole)) return `Diffusion d'une alerte ${effectiveLevel} réservée à ${minRole} ou supérieur`;
    const fe = fourEyesViolation(a, actor, effectiveLevel);
    if (fe) return fe;
  }
  return null;
}

/** Diffusion directe (POST /alerts/:id/broadcast). */
export function refuseBroadcast(a: AlertFacts, actor: Actor): string | null {
  if (!isOpen(a)) return `Alerte non diffusable (statut ${a.status})`;
  if (a.status !== AlertStatus.VALIDATED) return 'Seule une alerte validée peut être diffusée';
  if (a.requiresMedicalReview) return 'Revue médicale requise avant toute diffusion (épidémie)';
  const phase = normalizePhase(a.currentStep);
  if (phase === PHASE.RECEPTION) return 'Alerte non vérifiée — passez par /advance';
  if (needsConfirmation(a.alertLevel) && phase !== PHASE.CONFIRMEE) {
    return 'Niveau ROUGE/ROUGE_FONCE : confirmation de l\'autorité requise avant diffusion';
  }
  const minRole = LEVEL_CONFIG[a.alertLevel].minBroadcastRole;
  if (!hasLevel(actor.role, minRole)) return `Diffusion d'une alerte ${a.alertLevel} réservée à ${minRole} ou supérieur`;
  return fourEyesViolation(a, actor, a.alertLevel);
}

export const MIN_BYPASS_JUSTIFICATION = 20;

/**
 * Bypass d'urgence : fonctionnalité volontaire, désormais bornée (audit F05).
 * Jamais sur une alerte rejetée/clôturée/annulée ou déjà diffusée, jamais
 * tant qu'une revue médicale est requise, justification substantielle.
 * Le message part avec la mention « vérification en cours » et le bypass
 * est soumis à revue a posteriori.
 */
export function refuseBypass(a: AlertFacts, actor: Actor, justification: string | undefined): string | null {
  if (!mayEmergencyBypass(actor.role)) return 'Diffusion d\'urgence réservée à MAIRIE ou supérieur';
  if (!justification || justification.trim().length < MIN_BYPASS_JUSTIFICATION) {
    return `Justification d'au moins ${MIN_BYPASS_JUSTIFICATION} caractères obligatoire`;
  }
  if (!isOpen(a)) return `Diffusion d'urgence impossible (statut ${a.status})`;
  if (a.requiresMedicalReview) return 'Revue médicale requise : le bypass ne lève pas ce blocage';
  return null;
}

/** Auto-escalade (si activée) : uniquement une alerte encore ouverte, vérifiée, non rejetée. */
export function autoEscalationEligible(a: AlertFacts): boolean {
  return isOpen(a)
    && a.status === AlertStatus.VALIDATED
    && normalizePhase(a.currentStep) === PHASE.VERIFIEE
    && needsConfirmation(a.alertLevel)
    && !a.requiresMedicalReview;
}

/** Pré-alerte citoyenne (si activée) : ROUGE+ fraîchement vérifiée, hors revue médicale. */
export function prealertEligible(a: AlertFacts): boolean {
  return isOpen(a)
    && a.status === AlertStatus.VALIDATED
    && normalizePhase(a.currentStep) === PHASE.VERIFIEE
    && needsConfirmation(a.alertLevel)
    && !a.requiresMedicalReview;
}
