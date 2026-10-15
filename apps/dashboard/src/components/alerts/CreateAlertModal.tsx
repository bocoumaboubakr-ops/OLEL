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
    municipalityId: '',
    latitude: '',
    longitude: '',
  });
  const [municipalities, setMunicipalities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  useEffect(() => {
    axios.get(`${API}/zones`, { headers: auth() }).then(({ data }) => setZones(data)).catch(() => {});
    axios.get(`${API}/territories/municipalities`, { headers: auth() }).then(({ data }) => setMunicipalities(data)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API}/alerts`, {
        ...form,
        severity: Number(form.severity),
        municipalityId: form.municipalityId || undefined,
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0F172A', fontWeight: 700, letterSpacing: '-0.02em' }}>Nouvelle alerte</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>Fermer</button>
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
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: '0.74rem',
                      fontWeight: active ? 600 : 500,
                      border: '1px solid ' + (active ? 'transparent' : '#E5E7EB'),
                      background: active ? cfg.bg : 'white',
                      color: active ? cfg.color : '#64748B',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 6 }}>
              Orange et plus exigent une triple validation (sentinelle + autorité locale + autorité admin) avant diffusion.
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

          {municipalities.length > 0 && (
            <Field label="Commune (optionnel)">
              <select value={form.municipalityId} onChange={set('municipalityId')} style={inputStyle}>
                <option value="">-- Aucune commune précise --</option>
                {municipalities.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.department?.region?.name ? ` · ${m.department.region.name}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

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

          {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: '0.88rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'white', color: '#64748B', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
              Annuler
            </button>
            <button type="submit" disabled={loading} style={{ flex: 2, background: '#0F172A', color: 'white', border: 'none', padding: '12px', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem', opacity: loading ? 0.6 : 1, letterSpacing: '-0.005em' }}>
              {loading ? 'Création…' : 'Créer l\'alerte'}
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
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};
