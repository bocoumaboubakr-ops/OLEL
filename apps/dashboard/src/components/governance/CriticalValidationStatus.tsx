'use client';

import { CRITICAL_LEVELS, CRITICAL_CATEGORY_LABEL, AlertLevel } from '@/lib/governance';

/**
 * Affiche l'état des 3 validations critiques requises pour diffuser une alerte
 * ORANGE / ROUGE / ROUGE_FONCE. `criticalValidations` = liste brute du backend
 * (chaque entrée a un validatorCategory).
 */
export function CriticalValidationStatus({
  alertLevel,
  criticalValidations = [],
}: {
  alertLevel?: string;
  criticalValidations?: any[];
}) {
  if (!CRITICAL_LEVELS.includes(alertLevel as AlertLevel)) return null;

  const categories = ['SENTINELLE_CATEGORY', 'AUTORITE_LOCALE', 'AUTORITE_ADMIN'] as const;
  const done = (cat: string) => criticalValidations.some((v) => v.validatorCategory === cat);
  const total = categories.filter((c) => done(c)).length;
  const allDone = total === 3;

  return (
    <div
      style={{
        background: allDone ? '#dcfce7' : '#fff7ed',
        border: `1px solid ${allDone ? '#86efac' : '#fed7aa'}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: allDone ? '#15803d' : '#9a3412' }}>
          {allDone ? '✅ Triple validation complète' : '🔒 Validation critique requise'}
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: allDone ? '#15803d' : '#9a3412' }}>
          {total}/3
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {categories.map((cat) => {
          const ok = done(cat);
          const entry = criticalValidations.find((v) => v.validatorCategory === cat);
          return (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem' }}>
              <span
                style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: ok ? '#16a34a' : '#e2e8f0', color: ok ? 'white' : '#94a3b8',
                  fontSize: '0.65rem', fontWeight: 700,
                }}
              >
                {ok ? '✓' : '—'}
              </span>
              <span style={{ color: ok ? '#374151' : '#94a3b8', flex: 1 }}>
                {CRITICAL_CATEGORY_LABEL[cat]}
              </span>
              {entry?.validator?.name && (
                <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{entry.validator.name}</span>
              )}
            </div>
          );
        })}
      </div>
      {!allDone && (
        <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#9a3412', fontStyle: 'italic' }}>
          La diffusion est bloquée tant que les 3 catégories n'ont pas validé.
        </div>
      )}
    </div>
  );
}
