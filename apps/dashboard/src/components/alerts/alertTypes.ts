export const ALERT_TYPES = [
  { value: 'INONDATION',           label: '🌊 Inondation' },
  { value: 'SECHERESSE',           label: '☀️ Sécheresse' },
  { value: 'INCENDIE',             label: '🔥 Incendie' },
  { value: 'TEMPETE',              label: '🌪️ Tempête / Vent fort' },
  { value: 'EPIDEMIE',             label: '🦠 Épidémie / Maladie' },
  { value: 'LOCUSTES',             label: '🦗 Criquets / Nuisibles' },
  { value: 'ACCIDENT_INDUSTRIEL',  label: '🏭 Accident industriel' },
  { value: 'MOUVEMENT_DE_TERRAIN', label: '⛰️ Mouvement de terrain' },
  { value: 'AUTRE',                label: '⚠️ Autre danger' },
];

export const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Vigilance', color: '#22c55e' },
  2: { label: 'Alerte',    color: '#f59e0b' },
  3: { label: 'Urgence',   color: '#ef4444' },
};
