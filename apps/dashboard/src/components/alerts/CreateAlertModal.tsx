'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { ALERT_TYPES, SEVERITY_LABELS } from '@/components/alerts/alertTypes';
import { LEVEL_CONFIG, AlertLevel } from '@/lib/governance';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function CreateAlertModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [zones, setZones] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'INONDATION',
    alertLevel: 'BLEU',
    severity: 2,
    zoneId: '',
    latitude: '',
    longitude: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  useEffect(() => {
    axios.get(`${API}/zones`, { headers: auth() }).then(({ data }) => setZones(data)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API}/alerts`, {
        ...form,
        severity: Number(form.severity),
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      }, { headers: auth() });
      onCreated();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1a3c5e' }}>🚨 Nouvelle alerte</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#94a3b8' }}>✕</button>
        </div>

        <form onSubmit={submit}>
          <Field label="Titre">
            <input value={form.title} onChange={set('title')} required placeholder="Ex: Montée des eaux — village X" style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Type de risque">
              <select value={form.type} onChange={set('type')} style={inputStyle}>
                {ALERT_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Niveau de gravité">
              <select value={form.severity} onChange={set('severity')} style={inputStyle}>
                {[1, 2, 3].map((s) => (
                  <option key={s} value={s}>{SEVERITY_LABELS[s].label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Niveau d'alerte">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(LEVEL_CONFIG) as AlertLevel[]).map((lvl) => {
                const cfg = LEVEL_CONFIG[lvl];
                const active = form.alertLevel === lvl;
                return (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => setForm((f) => ({ ...f, alertLevel: lvl }))}
                    style={{
                      flex: '1 1 auto',
                      padding: '7px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      border: active ? `2px solid ${cfg.color}` : '1px solid #e2e8f0',
                      background: active ? cfg.bg : 'white',
                      color: active ? cfg.color : '#64748b',
                    }}
                  >
                    {cfg.icon} {cfg.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>
              ORANGE et plus exigent une triple validation (sentinelle + autorité locale + autorité admin) avant diffusion.
            </div>
          </Field>

          <Field label="Zone concernée">
            <select value={form.zoneId} onChange={set('zoneId')} required style={inputStyle}>
              <option value="">-- Sélectionner une zone --</option>
              {zones.map((z: any) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={set('description')}
              required
              rows={4}
              placeholder="Décrivez la situation : ampleur, zones affectées, populations à risque..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Latitude (optionnel)">
              <input value={form.latitude} onChange={set('latitude')} type="number" step="any" placeholder="15.6556" style={inputStyle} />
            </Field>
            <Field label="Longitude (optionnel)">
              <input value={form.longitude} onChange={set('longitude')} type="number" step="any" placeholder="-13.2553" style={inputStyle} />
            </Field>
          </div>

          {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: '0.88rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: '#f1f5f9', color: '#374151', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Annuler
            </button>
            <button type="submit" disabled={loading} style={{ flex: 2, background: '#e74c3c', color: 'white', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Création...' : '🚨 Créer l\'alerte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', marginBottom: 5, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};
