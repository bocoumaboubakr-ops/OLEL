'use client';

import { useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const ALERT_TYPES = [
  { value: 'INONDATION',          label: '🌊 Inondation',           color: '#3b82f6' },
  { value: 'SECHERESSE',          label: '☀️ Sécheresse',           color: '#f59e0b' },
  { value: 'INCENDIE',            label: '🔥 Incendie',             color: '#ef4444' },
  { value: 'TEMPETE',             label: '🌪️ Tempête / Vent fort',  color: '#6366f1' },
  { value: 'EPIDEMIE',            label: '🦠 Épidémie / Maladie',   color: '#ec4899' },
  { value: 'LOCUSTES',            label: '🦗 Criquets / Nuisibles', color: '#84cc16' },
  { value: 'ACCIDENT_INDUSTRIEL', label: '🏭 Accident industriel',  color: '#78716c' },
  { value: 'MOUVEMENT_DE_TERRAIN',label: '⛰️ Mouvement de terrain', color: '#92400e' },
  { value: 'AUTRE',               label: '⚠️ Autre danger',         color: '#64748b' },
];

export const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Vigilance', color: '#22c55e' },
  2: { label: 'Alerte',    color: '#f59e0b' },
  3: { label: 'Urgence',   color: '#ef4444' },
};

export function ReportForm() {
  const [type, setType] = useState('INONDATION');
  const [severity, setSeverity] = useState(2);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('olel_token');
      let latitude: number | undefined;
      let longitude: number | undefined;

      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }),
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {}

      const typeLabel = ALERT_TYPES.find((t) => t.value === type)?.label || type;

      await axios.post(
        `${API}/signalements`,
        {
          type,
          text,
          latitude,
          longitude,
          channel: 'mobile',
          severity,
          title: `Signalement : ${typeLabel}`,
          zoneId: process.env.NEXT_PUBLIC_DEFAULT_ZONE_ID,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setSuccess(true);
      setText('');
      setTimeout(() => setSuccess(false), 5000);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors du signalement');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
        <h2 style={{ color: '#16a34a' }}>Signalement envoyé !</h2>
        <p style={{ color: '#555' }}>Votre signalement a bien été transmis aux autorités compétentes.</p>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>Un agent va examiner votre signalement.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#1a3c5e' }}>📢 Signaler une situation</h2>

      <form onSubmit={handleSubmit}>
        {/* Type d'alerte */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
            Type de risque
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ALERT_TYPES.map(({ value, label, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                style={{
                  padding: '10px 8px',
                  border: `2px solid ${type === value ? color : '#e2e8f0'}`,
                  borderRadius: 8,
                  background: type === value ? color + '18' : 'white',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: type === value ? 700 : 400,
                  color: type === value ? color : '#555',
                  textAlign: 'left',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Niveau de gravité */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
            Niveau de gravité estimé
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: `2px solid ${severity === s ? SEVERITY_LABELS[s].color : '#e2e8f0'}`,
                  borderRadius: 8,
                  background: severity === s ? SEVERITY_LABELS[s].color + '18' : 'white',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: severity === s ? 700 : 400,
                  color: severity === s ? SEVERITY_LABELS[s].color : '#888',
                }}
              >
                {SEVERITY_LABELS[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
            Description de la situation
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Décrivez ce que vous observez : lieu précis, ampleur, personnes affectées..."
            required
            rows={4}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: '0.95rem',
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 6, marginBottom: 16, fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !text.trim()}
          style={{
            width: '100%',
            background: '#1a3c5e',
            color: 'white',
            border: 'none',
            padding: '14px',
            borderRadius: 8,
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            opacity: loading || !text.trim() ? 0.6 : 1,
          }}
        >
          {loading ? 'Envoi en cours...' : '📢 Envoyer le signalement'}
        </button>
      </form>
    </div>
  );
}
