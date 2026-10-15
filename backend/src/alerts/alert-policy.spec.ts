import { AlertLevel, AlertStatus, AlertStep, Role, ValidationAction } from '@prisma/client';
import {
  AlertFacts, autoEscalationEligible, prealertEligible, refuseAdvance, refuseBroadcast, refuseBypass, routingLevel,
} from './alert-policy';

/** Règles d'alerte (source unique côté serveur — audit F03, F05). */
const facts = (o: Partial<AlertFacts> = {}): AlertFacts => ({
  status: AlertStatus.VALIDATED, currentStep: AlertStep.MAIRIE, alertLevel: AlertLevel.ROUGE,
  broadcastAt: null, requiresMedicalReview: false, createdById: 'auteur', priorValidatorIds: [], ...o,
});
const actor = (role: Role, id = `id-${role}`) => ({ id, role });

describe('alert-policy', () => {
  describe('états terminaux (F03)', () => {
    it.each([AlertStatus.REJECTED, AlertStatus.CANCELLED, AlertStatus.CLOSED, AlertStatus.RESOLVED])(
      '%s : ni validation, ni diffusion, ni bypass, ni automatisme', (status) => {
        const a = facts({ status });
        expect(refuseAdvance(a, actor(Role.GOUVERNORAT), ValidationAction.VALIDATED)).not.toBeNull();
        expect(refuseBroadcast(a, actor(Role.GOUVERNORAT))).not.toBeNull();
        expect(refuseBypass(a, actor(Role.GOUVERNORAT), 'justification largement suffisante ici')).not.toBeNull();
        expect(autoEscalationEligible(a)).toBe(false);
        expect(prealertEligible(a)).toBe(false);
      });

    it('une alerte déjà diffusée n\'est plus rediffusable', () => {
      const a = facts({ status: AlertStatus.BROADCAST, currentStep: AlertStep.BROADCAST, broadcastAt: new Date() });
      expect(refuseBroadcast(a, actor(Role.GOUVERNORAT))).not.toBeNull();
      expect(autoEscalationEligible(a)).toBe(false);
    });
  });

  describe('confirmation ROUGE (F05)', () => {
    it('le niveau de parcours est le plus élevé de l\'actuel et du proposé', () => {
      expect(routingLevel(AlertLevel.ROUGE, AlertLevel.ORANGE)).toBe(AlertLevel.ROUGE);
      expect(routingLevel(AlertLevel.JAUNE, AlertLevel.ROUGE)).toBe(AlertLevel.ROUGE);
      expect(routingLevel(AlertLevel.ORANGE)).toBe(AlertLevel.ORANGE);
    });

    it('à l\'étape CONFIRMÉE, abaisser ROUGE → ORANGE exige toujours l\'autorité préfectorale', () => {
      const a = facts({ currentStep: AlertStep.PREFECTURE });
      expect(refuseAdvance(a, actor(Role.MAIRIE), ValidationAction.VALIDATED, AlertLevel.ORANGE)).not.toBeNull();
      expect(refuseAdvance(a, actor(Role.PREFECTURE), ValidationAction.VALIDATED, AlertLevel.ORANGE)).toBeNull();
    });

    it('le rejet exige la même autorité que la validation à l\'étape', () => {
      const a = facts({ currentStep: AlertStep.PREFECTURE });
      expect(refuseAdvance(a, actor(Role.SENTINELLE), ValidationAction.REJECTED)).not.toBeNull();
      expect(refuseAdvance(a, actor(Role.MAIRIE), ValidationAction.REJECTED)).not.toBeNull();
      expect(refuseAdvance(a, actor(Role.PREFECTURE), ValidationAction.REJECTED)).toBeNull();
    });

    it('diffusion directe d\'une ROUGE seulement depuis CONFIRMÉE et par PRÉFECTURE+', () => {
      expect(refuseBroadcast(facts({ currentStep: AlertStep.MAIRIE }), actor(Role.GOUVERNORAT))).not.toBeNull();
      expect(refuseBroadcast(facts({ currentStep: AlertStep.PREFECTURE }), actor(Role.MAIRIE))).not.toBeNull();
      expect(refuseBroadcast(facts({ currentStep: AlertStep.PREFECTURE }), actor(Role.PREFECTURE))).toBeNull();
    });

    it('deux personnes distinctes : ni l\'auteur ni un validateur précédent ne confirme une ROUGE', () => {
      const a = facts({ currentStep: AlertStep.PREFECTURE, createdById: 'p1', priorValidatorIds: ['p2'] });
      expect(refuseBroadcast(a, actor(Role.PREFECTURE, 'p1'))).toMatch(/autre personne/);
      expect(refuseBroadcast(a, actor(Role.PREFECTURE, 'p2'))).toMatch(/autre personne/);
      expect(refuseAdvance(a, actor(Role.PREFECTURE, 'p2'), ValidationAction.VALIDATED)).toMatch(/autre personne/);
      expect(refuseBroadcast(a, actor(Role.PREFECTURE, 'p3'))).toBeNull();
    });

    it('une ORANGE vérifiée est diffusable par la mairie (pas de double regard requis)', () => {
      const a = facts({ alertLevel: AlertLevel.ORANGE, createdById: 'm1' });
      expect(refuseBroadcast(a, actor(Role.MAIRIE, 'm1'))).toBeNull();
    });
  });

  describe('revue médicale (F05, décision D1)', () => {
    const epi = facts({ alertLevel: AlertLevel.ORANGE, requiresMedicalReview: true });
    it('bloque validation diffusante, diffusion directe et bypass', () => {
      expect(refuseAdvance(epi, actor(Role.MAIRIE), ValidationAction.VALIDATED)).toMatch(/médicale/);
      expect(refuseBroadcast(epi, actor(Role.GOUVERNORAT))).toMatch(/médicale/);
      expect(refuseBypass(epi, actor(Role.GOUVERNORAT), 'justification largement suffisante ici')).toMatch(/médicale/);
      expect(autoEscalationEligible({ ...epi, alertLevel: AlertLevel.ROUGE })).toBe(false);
    });
  });

  describe('bypass d\'urgence', () => {
    it('réservé à MAIRIE+, avec une justification substantielle', () => {
      const a = facts({ status: AlertStatus.PENDING, currentStep: AlertStep.SIGNALEMENT });
      expect(refuseBypass(a, actor(Role.COORDINATEUR), 'justification largement suffisante ici')).not.toBeNull();
      expect(refuseBypass(a, actor(Role.MAIRIE), 'urgent')).toMatch(/Justification/);
      expect(refuseBypass(a, actor(Role.MAIRIE), '                         ')).toMatch(/Justification/);
      expect(refuseBypass(a, actor(Role.MAIRIE), 'Digue rompue, eau dans les maisons')).toBeNull();
    });
  });
});
