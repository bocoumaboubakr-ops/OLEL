'use client';

import { useState } from 'react';
import axios from 'axios';
import { TYPE_META, SEVERITY_COLOR, SEVERITY_LABEL, STATUS_STYLE } from './AlertsFeed';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export function AlertDetail({ alert, currentUser, onClose, onRefetch }: {
  alert: any;
  currentUser: any;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');

  const meta = TYPE_META[alert.type] || TYPE_META.AUTRE;
  const sev = SEVERITY_COLOR[alert.severity] || '#888';
  const status = STATUS_STYLE[alert.status] || STATUS_STYLE.PENDING;
  const canValidate = ['MAIRIE', 'PREFECTURE', 'ADMIN'].includes(currentUser.role);
  const canResolve = ['PREFECTURE', 'ADMIN'].includes(currentUser.role);

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  const validate = async (approved: boolean) => {
    setLoading(true);
    try {
      await axios.post(`${API}/alerts/${alert.id}/validate`, { approved, comment }, { headers: auth() });
      onRefetch();
      onClose();
    } finally { setLoading(false); }
  };

  const resolve = async () => {
    setLoading(true);
    try {
      await axios.patch(`${API}/alerts/${alert.id}/resolve`, {}, { headers: auth() });
      onRefetch();
      onClose();
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, height: '100vh', width: 420,
      background: 'white', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', zIndex: 1000,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a3c5e', marginBottom: 4 }}>
            {meta.icon} {alert.title}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: status.bg, color: status.color, fontWeight: 600 }}>
              {status.label}
            </span>
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: sev + '22', color: sev, fontWeight: 600 }}>
              {SEVERITY_LABEL[alert.severity]}
            </span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#94a3b8', padding: 4 }}>✕</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <Section title="Description">
          <p style={{ margin: 0, color: '#374151', lineHeight: 1.6, fontSize: '0.9rem' }}>{alert.description}</p>
        </Section>

        <Section title="Localisation">
          <div style={{ color: '#6b7280', fontSize: '0.88rem' }}>
            <div>📍 Zone : <strong>{alert.zone?.name || 'Inconnue'}</strong></div>
            {alert.latitude && <div style={{ marginTop: 4 }}>🌐 {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</div>}
          </div>
        </Section>

        <Section title="Informations">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.82rem', color: '#6b7280' }}>
            <div>Type : <strong>{meta.label}</strong></div>
            <div>Sévérité : <strong style={{ color: sev }}>{SEVERITY_LABEL[alert.severity]}</strong></div>
            <div>Créé le : <strong>{new Date(alert.createdAt).toLocaleDateString('fr-FR')}</strong></div>
            {alert.resolvedAt && <div>Résolu le : <strong>{new Date(alert.resolvedAt).toLocaleDateString('fr-FR')}</strong></div>}
          </div>
        </Section>

        {alert.validations?.length > 0 && (
          <Section title="Validations">
            {alert.validations.map((v: any, i: number) => (
              <div key={i} style={{ fontSize: '0.82rem', padding: '6px 10px', background: v.approved ? '#dcfce7' : '#fee2e2', borderRadius: 6, marginBottom: 6 }}>
                <strong>{v.validator?.name}</strong> — {v.approved ? '✅ Approuvé' : '❌ Rejeté'}
                {v.comment && <div style={{ color: '#6b7280', marginTop: 2 }}>{v.comment}</div>}
              </div>
            ))}
          </Section>
        )}

        {/* Actions */}
        {(canValidate || canResolve) && (
          <Section title="Actions">
            {canValidate && alert.status === 'PENDING' && (
              <>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Commentaire (optionnel)"
                  rows={2}
                  style={{ width: '100%', marginBottom: 8, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.85rem', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={loading}
                    onClick={() => validate(true)}
                    style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    ✅ Valider
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => validate(false)}
                    style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    ❌ Rejeter
                  </button>
                </div>
              </>
            )}
            {canResolve && alert.status === 'ACTIVE' && (
              <button
                disabled={loading}
                onClick={resolve}
                style={{ width: '100%', background: '#1d4ed8', color: 'white', border: 'none', padding: '10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', marginTop: 8 }}
              >
                🏁 Clôturer l'alerte
              </button>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
