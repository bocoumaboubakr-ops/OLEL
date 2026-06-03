'use client';

import { useState } from 'react';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const TYPES = [
  { value: 'INONDATION', label: '🌊 Inondation' },
  { value: 'INCENDIE', label: '🔥 Incendie' },
  { value: 'SECHERESSE', label: '☀️ Sécheresse' },
  { value: 'EPIDEMIE', label: '🦠 Épidémie' },
  { value: 'AUTRE', label: '⚠️ Autre' },
];

export function ReportForm() {
  const [type, setType] = useState('INONDATION');
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

      await axios.post(
        `${API}/alerts`,
        {
          title: `Signalement : ${TYPES.find((t) => t.value === type)?.label}`,
          description: text,
          type,
          zoneId: process.env.NEXT_PUBLIC_DEFAULT_ZONE_ID || '00000000-0000-0000-0000-000000000000',
          latitude,
          longitude,
          severity: 2,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setSuccess(true);
      setText('');
      setTimeout(() => setSuccess(false), 4000);
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
        <p style={{ color: '#888' }}>Les autorités ont été notifiées.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#1a3c5e' }}>📢 Signaler une situation</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Type d'événement</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                style={{
                  padding: '10px 8px',
                  border: `2px solid ${type === value ? '#1a3c5e' : '#ddd'}`,
                  borderRadius: 8,
                  background: type === value ? '#e8f0fe' : 'white',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: type === value ? 700 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Description</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Décrivez la situation..."
            required
            rows={4}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: '1rem', resize: 'vertical', boxSizing: 'border-box' }}
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
            background: '#e74c3c',
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
          {loading ? 'Envoi en cours...' : '🚨 Envoyer le signalement'}
        </button>
      </form>
    </div>
  );
}
