import { buildFrozenPayload, buildTemplateCalls, FrozenPayloadInput } from './alert-messages';

const base: FrozenPayloadInput = {
  level: 'ORANGE', certainty: 'CONFIRMED', approvedText: 'Éloignez-vous du fleuve.',
  title: 'Crue (exercice)', description: 'données fictives', zoneNames: ['Commune A'],
};

describe('Mention EXERCICE (mode pilote)', () => {
  it('absente hors pilote', () => {
    const p = buildFrozenPayload(base);
    expect(p.fr).not.toMatch(/EXERCICE/);
    expect(buildTemplateCalls(base)!.fr.params[0]).toBe('Crue (exercice)');
  });

  it('en tête et en fin du texte figé, dans chaque langue, et dans le titre des modèles', () => {
    const p = buildFrozenPayload({ ...base, exercise: true });
    for (const lang of ['fr', 'ff', 'wo', 'snk'] as const) {
      expect(p[lang]).toMatch(/^\[OLEL\] EXERCICE — /);
      expect(p[lang]).toMatch(/\nEXERCICE$/);
    }
    expect(buildTemplateCalls({ ...base, exercise: true })!.fr.params[0]).toBe('EXERCICE — Crue (exercice)');
  });

  it('cumulée avec la mention de certitude (rectificatif, retrait)', () => {
    expect(buildFrozenPayload({ ...base, certainty: 'CORRECTION', exercise: true }).fr).toMatch(/^\[OLEL\] EXERCICE — PRE-ALERTE — RECTIFICATIF/);
    expect(buildFrozenPayload({ ...base, certainty: 'RETRACTION', exercise: true }).fr).toMatch(/^\[OLEL\] EXERCICE — ALERTE ANNULÉE/);
    expect(buildTemplateCalls({ ...base, certainty: 'RETRACTION', exercise: true })!.fr.params[0]).toMatch(/^EXERCICE — ALERTE ANNULÉE — /);
  });
});
