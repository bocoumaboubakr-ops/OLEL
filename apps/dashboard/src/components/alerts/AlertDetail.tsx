'use client';

import { useState } from 'react';
import axios from 'axios';

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, 1200 / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.75);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
import { TYPE_META, SEVERITY_COLOR, SEVERITY_LABEL, STATUS_STYLE, WORKFLOW_STEPS, STEP_LABEL } from './AlertsFeed';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Miroir de alert-workflow.ts (backend) — hiérarchie des rôles
const ROLE_LEVEL: Record<string, number> = {
  CITOYEN: 0, SENTINELLE: 1, MAIRIE: 2, PREFECTURE: 3,
  GOUVERNORAT: 4, PROTECTION_CIVILE: 4, ADMIN: 99, SUPER_ADMIN: 99,
};

// Rôle minimum requis pour agir à chaque étape (advance)
// PREFECTURE est géré par broadcast(), pas advance() → absent de cette map
const STEP_MIN_ROLE: Record<string, number> = {
  SIGNALEMENT: 1,  // SENTINELLE valide sur le terrain
  SENTINELLE:  2,  // MAIRIE confirme
  MAIRIE:      3,  // PREFECTURE valide
};

// Message d'aide affiché sous l'étape active
const STEP_NEXT_ACTION: Record<string, string> = {
  SIGNALEMENT: 'Une sentinelle doit vérifier sur le terrain (photo + GPS + gravité)',
  SENTINELLE:  'La mairie doit confirmer le signalement',
  MAIRIE:      'La préfecture doit valider avant diffusion',
  PREFECTURE:  'La préfecture peut maintenant diffuser l\'alerte',
  BROADCAST:   'Alerte diffusée — la mairie peut clôturer avec bilan',
  CLOSED:      'Alerte clôturée',
};

export function AlertDetail({ alert, currentUser, onClose, onRefetch }: {
  alert: any;
  currentUser: any;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [gravity, setGravity] = useState('2');
  const [reason, setReason] = useState('');

  const meta = TYPE_META[alert.type] || TYPE_META.AUTRE;
  const sev = SEVERITY_COLOR[alert.severity] || '#888';
  const status = STATUS_STYLE[alert.status] || STATUS_STYLE.PENDING;
  const level = ROLE_LEVEL[currentUser.role] ?? 0;
  const step = alert.currentStep || 'SIGNALEMENT';

  const isTerminal = ['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED', 'BROADCAST'].includes(alert.status);
  // PREFECTURE step → géré uniquement par broadcast(), pas advance()
  const canAdvance = !isTerminal
    && alert.status !== 'BROADCASTING'
    && ['SIGNALEMENT', 'SENTINELLE', 'MAIRIE'].includes(step)
    && level >= (STEP_MIN_ROLE[step] ?? 99);
  // Diffusion : les DEUX conditions doivent être vraies (AND, pas OR)
  const canBroadcast = !isTerminal
    && alert.status === 'VALIDATED'
    && step === 'PREFECTURE'
    && level >= ROLE_LEVEL.PREFECTURE;
  const canClose = alert.status === 'BROADCAST' && level >= ROLE_LEVEL.MAIRIE;
  const needsProof = step === 'SIGNALEMENT';

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('olel_token')}` });

  const run = async (fn: () => Promise<any>) => {
    setLoading(true); setError('');
    try { await fn(); onRefetch(); onClose(); }
    catch (e: any) { setError(e.response?.data?.message || 'Erreur'); }
    finally { setLoading(false); }
  };

  const advance = (action: 'VALIDATED' | 'REJECTED' | 'ESCALATED') => run(async () => {
    const body: any = { action, comment };
    if (needsProof && action !== 'REJECTED') {
      if (!photoUrl) throw new Error('Photo de preuve obligatoire — uploadez une photo avant de valider');
      body.photoUrl = photoUrl;
      body.gravity = Number(gravity);

      // GPS : tenter la capture, utiliser coords de l'alerte en fallback
      const gpsAvailable = typeof navigator !== 'undefined' && !!navigator.geolocation;
      if (gpsAvailable) {
        await new Promise<void>((res) => {
          navigator.geolocation.getCurrentPosition(
            (p) => { body.latitude = p.coords.latitude; body.longitude = p.coords.longitude; res(); },
            () => {
              // GPS refusé/indisponible : utiliser les coords du signalement d'origine
              body.latitude = alert.latitude ?? 15.6556;
              body.longitude = alert.longitude ?? -13.2553;
              res();
            },
            { timeout: 5000, maximumAge: 30000 },
          );
        });
      } else {
        body.latitude = alert.latitude ?? 15.6556;
        body.longitude = alert.longitude ?? -13.2553;
      }
    }
    await axios.post(`${API}/alerts/${alert.id}/advance`, body, { headers: auth() });
  });

  const broadcast = () => run(() => axios.post(`${API}/alerts/${alert.id}/broadcast`, {}, { headers: auth() }));
  const close = () => run(() => axios.post(`${API}/alerts/${alert.id}/close`, { reason }, { headers: auth() }));

  const currentStepIdx = WORKFLOW_STEPS.indexOf(step as any);

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
        {/* Stepper du cursus */}
        <Section title="Cursus de l'alerte">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {WORKFLOW_STEPS.map((s, i) => {
              const allDone = alert.status === 'CLOSED' || alert.status === 'BROADCAST';
              const done = i < currentStepIdx || (allDone && i <= currentStepIdx && alert.status !== 'REJECTED');
              const active = i === currentStepIdx && !['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED'].includes(alert.status);
              const rejected = alert.status === 'REJECTED' && i === currentStepIdx;
              const waiting = i > currentStepIdx;
              const nextAction = active ? STEP_NEXT_ACTION[s] : null;
              return (
                <div key={s}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700,
                      background: rejected ? '#dc2626' : done ? '#16a34a' : active ? '#1a3c5e' : '#e2e8f0',
                      color: (done || active || rejected) ? 'white' : '#94a3b8',
                      boxShadow: active ? '0 0 0 3px rgba(26,60,94,0.15)' : 'none',
                    }}>
                      {rejected ? '✕' : done ? '✓' : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: active ? 700 : 400, color: rejected ? '#dc2626' : active ? '#1a3c5e' : waiting ? '#cbd5e1' : '#64748b' }}>
                        {STEP_LABEL[s]}
                      </span>
                    </div>
                    {active && !rejected && (
                      <span style={{ fontSize: '0.65rem', background: '#1a3c5e', color: 'white', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>
                        EN COURS
                      </span>
                    )}
                  </div>
                  {active && nextAction && (
                    <div style={{ marginLeft: 34, marginBottom: 4, fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                      → {nextAction}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

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
            {alert.broadcastAt && <div>Diffusé le : <strong>{new Date(alert.broadcastAt).toLocaleDateString('fr-FR')}</strong></div>}
            {alert.closedAt && <div>Clôturé le : <strong>{new Date(alert.closedAt).toLocaleDateString('fr-FR')}</strong></div>}
          </div>
          {alert.closureReason && <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#6b7280' }}>Bilan : {alert.closureReason}</div>}
        </Section>

        {alert.validations?.length > 0 && (
          <Section title="Historique des validations">
            {alert.validations.map((v: any, i: number) => (
              <div key={i} style={{ fontSize: '0.82rem', padding: '6px 10px', background: v.approved ? '#dcfce7' : '#fee2e2', borderRadius: 6, marginBottom: 6 }}>
                <strong>{v.validator?.name}</strong> ({v.validator?.role}) — {v.action || (v.approved ? 'VALIDATED' : 'REJECTED')}
                {v.step && <span style={{ color: '#94a3b8' }}> · {STEP_LABEL[v.step] || v.step}</span>}
                {v.comment && <div style={{ color: '#6b7280', marginTop: 2 }}>{v.comment}</div>}
              </div>
            ))}
          </Section>
        )}

        {/* Actions du cursus */}
        {(canAdvance || canBroadcast || canClose) && (
          <Section title="Action requise">
            {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 10px', borderRadius: 6, marginBottom: 10, fontSize: '0.82rem' }}>{error}</div>}

            {canAdvance && (
              <>
                {needsProof && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: 6 }}>
                      Validation sentinelle : preuve obligatoire (photo + GPS + gravité)
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      {photoUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <img src={photoUrl} alt="preuve" style={{ height: 60, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                          <button onClick={() => setPhotoUrl('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem' }}>✕ Supprimer</button>
                        </div>
                      ) : (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'white', border: '1.5px dashed #d97706', borderRadius: 8, padding: '10px 14px' }}>
                          <span style={{ fontSize: '1.1rem' }}>📷</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>
                            {photoUploading ? 'Upload en cours…' : 'Choisir une photo de preuve'}
                          </span>
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setPhotoUploading(true);
                              try {
                                const compressed = await compressImage(file);
                                const fd = new FormData();
                                fd.append('file', compressed, file.name.replace(/\.[^.]+$/, '.jpg'));
                                const { data } = await axios.post(`${API}/upload/photo`, fd, { headers: { Authorization: `Bearer ${localStorage.getItem('olel_token')}`, 'Content-Type': 'multipart/form-data' } });
                                setPhotoUrl(data.url);
                              } catch { setError('Échec de l\'upload photo'); }
                              finally { setPhotoUploading(false); }
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <select value={gravity} onChange={(e) => setGravity(e.target.value)} style={{ ...inputS, marginTop: 6 }}>
                      <option value="0">Gravité 0 — Info</option>
                      <option value="1">Gravité 1 — Vigilance</option>
                      <option value="2">Gravité 2 — Alerte</option>
                      <option value="3">Gravité 3 — Urgence</option>
                    </select>
                    <div style={{ fontSize: '0.72rem', color: '#a16207', marginTop: 4 }}>📍 La position GPS sera capturée automatiquement.</div>
                  </div>
                )}
                <textarea
                  value={comment} onChange={(e) => setComment(e.target.value)}
                  placeholder="Commentaire (optionnel)" rows={2}
                  style={{ ...inputS, resize: 'none', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={loading} onClick={() => advance('VALIDATED')}
                    style={btn('#16a34a')}>✅ Valider</button>
                  <button disabled={loading} onClick={() => advance('REJECTED')}
                    style={btn('#dc2626')}>❌ Rejeter</button>
                </div>
                {needsProof && (
                  <button disabled={loading} onClick={() => advance('ESCALATED')}
                    style={{ ...btn('#ea580c'), width: '100%', marginTop: 8 }}>
                    ⚡ Escalader (urgence → préfecture)
                  </button>
                )}
              </>
            )}

            {canBroadcast && (
              <button disabled={loading} onClick={broadcast}
                style={{ ...btn('#a21caf'), width: '100%', marginTop: 8 }}>
                📢 Diffuser l'alerte (multi-canal)
              </button>
            )}

            {canClose && (
              <>
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Raison / bilan de clôture (obligatoire)" style={{ ...inputS, marginTop: 8 }} />
                <button disabled={loading} onClick={close}
                  style={{ ...btn('#1d4ed8'), width: '100%', marginTop: 8 }}>
                  🏁 Clôturer l'alerte
                </button>
              </>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

const inputS: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box', fontFamily: 'inherit',
};
const btn = (bg: string): React.CSSProperties => ({
  flex: 1, background: bg, color: 'white', border: 'none', padding: '9px',
  borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
