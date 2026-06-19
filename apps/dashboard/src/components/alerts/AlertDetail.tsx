'use client';

import { useState, useEffect } from 'react';
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
import { ROLE_LEVEL, STEP_MIN_LEVEL, CRITICAL_LEVELS, criticalCategory, AlertLevel } from '@/lib/governance';
import { AlertLevelBadge } from '@/components/governance/AlertLevelBadge';
import { CriticalValidationStatus } from '@/components/governance/CriticalValidationStatus';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Étapes franchissables via advance() (PREFECTURE/GOUVERNANCE → broadcast dédié)
const ADVANCE_STEPS = ['SIGNALEMENT', 'SENTINELLE', 'COORDINATEUR', 'MAIRIE'];

// Message d'aide affiché sous l'étape active
const STEP_NEXT_ACTION: Record<string, string> = {
  SIGNALEMENT:  'Une sentinelle doit vérifier sur le terrain (photo + GPS + gravité)',
  SENTINELLE:   'Le coordinateur doit valider la remontée terrain',
  COORDINATEUR: 'La mairie doit confirmer le signalement',
  MAIRIE:       'La préfecture doit valider avant diffusion',
  PREFECTURE:   'La préfecture peut diffuser (ou la gouvernance pour une crise majeure)',
  GOUVERNANCE:  'La gouvernance valide les crises majeures avant diffusion',
  BROADCAST:    'Alerte diffusée — la mairie peut clôturer avec bilan',
  CLOSED:       'Alerte clôturée',
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
  const [broadcastMsg, setBroadcastMsg] = useState('');

  const meta = TYPE_META[alert.type] || TYPE_META.AUTRE;
  const sev = SEVERITY_COLOR[alert.severity] || '#888';
  const status = STATUS_STYLE[alert.status] || STATUS_STYLE.PENDING;
  const level = ROLE_LEVEL[currentUser.role] ?? 0;
  const step = alert.currentStep || 'SIGNALEMENT';

  const isCritical = CRITICAL_LEVELS.includes(alert.alertLevel as AlertLevel);
  const myCriticalCategory = criticalCategory(currentUser.role);
  const alreadyValidatedCritical = (alert.criticalValidations || []).some(
    (v: any) => v.validator?.id === currentUser.id || v.validatorId === currentUser.id,
  );
  const criticalCount = new Set(
    (alert.criticalValidations || []).map((v: any) => v.validatorCategory),
  ).size;
  const criticalComplete = !isCritical || criticalCount === 3;

  const isTerminal = ['CLOSED', 'RESOLVED', 'REJECTED', 'CANCELLED', 'BROADCAST'].includes(alert.status);
  const canAdvance = !isTerminal
    && alert.status !== 'BROADCASTING'
    && ADVANCE_STEPS.includes(step)
    && level >= (STEP_MIN_LEVEL[step] ?? 99);
  // Diffusion : statut VALIDATED, étape PREFECTURE ou GOUVERNANCE, rôle PREFECTURE+,
  // et triple validation critique complète si niveau ORANGE+
  const canBroadcast = !isTerminal
    && alert.status === 'VALIDATED'
    && (step === 'PREFECTURE' || step === 'GOUVERNANCE')
    && level >= ROLE_LEVEL.PREFECTURE
    && criticalComplete;
  // Bouton de validation critique : niveau ORANGE+, rôle habilité, pas déjà validé
  const canCriticalValidate = isCritical && !isTerminal && !!myCriticalCategory && !alreadyValidatedCritical;
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

  const broadcast = () => run(async () => {
    if (!broadcastMsg.trim()) throw new Error('Message de diffusion obligatoire');
    await axios.post(`${API}/alerts/${alert.id}/broadcast`, { message: broadcastMsg }, { headers: auth() });
  });

  const emergencyBypass = () => run(async () => {
    const justification = window.prompt(
      "🚨 DIFFUSION D'URGENCE\n\nVa contourner toutes les vérifications et diffuser MAINTENANT.\nUne notification de contrôle sera envoyée à la préfecture.\n\nJustification (obligatoire, ≥ 10 caractères) :",
    );
    if (!justification || justification.trim().length < 10) {
      throw new Error('Justification trop courte (≥ 10 caractères requis)');
    }
    if (!window.confirm(`Diffuser cette alerte EN URGENCE avec la justification :\n« ${justification.trim()} » ?`)) {
      return;
    }
    await axios.post(`${API}/alerts/${alert.id}/emergency-bypass`, { justification: justification.trim() }, { headers: auth() });
  });
  const close = () => run(() => axios.post(`${API}/alerts/${alert.id}/close`, { reason }, { headers: auth() }));
  // Validation critique : ne ferme pas le panneau, juste refetch pour voir la progression
  const criticalValidate = async () => {
    setLoading(true); setError('');
    try {
      await axios.post(`${API}/alerts/${alert.id}/critical-validate`, { comment }, { headers: auth() });
      onRefetch();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const currentStepIdx = WORKFLOW_STEPS.indexOf(step as any);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, height: '100vh', width: 420,
      background: 'white', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column', zIndex: 1000,
    }}>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: sev + '14', color: sev, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', flexShrink: 0 }}>{meta.icon}</div>
            <div style={{ fontWeight: 600, fontSize: '0.98rem', color: '#0F172A', letterSpacing: '-0.01em' }}>{alert.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {alert.alertLevel && <AlertLevelBadge level={alert.alertLevel} size="sm" />}
            <span style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: 5, background: status.bg, color: status.color, fontWeight: 600 }}>
              {status.label}
            </span>
            <span style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: 5, background: sev + '14', color: sev, fontWeight: 600 }}>
              {SEVERITY_LABEL[alert.severity]}
            </span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#64748B', padding: 4, fontWeight: 500 }}>Fermer</button>
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
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 600,
                      background: rejected ? '#DC2626' : done ? '#16A34A' : active ? '#0F172A' : '#F1F5F9',
                      color: (done || active || rejected) ? 'white' : '#94A3B8',
                    }}>
                      {rejected ? '✕' : done ? '✓' : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: active ? 600 : 500, color: rejected ? '#DC2626' : active ? '#0F172A' : waiting ? '#CBD5E1' : '#64748B', letterSpacing: '-0.005em' }}>
                        {STEP_LABEL[s]}
                      </span>
                    </div>
                    {active && !rejected && (
                      <span style={{ fontSize: '0.66rem', background: '#0F172A', color: 'white', padding: '2px 8px', borderRadius: 5, fontWeight: 600, letterSpacing: '0.02em' }}>
                        En cours
                      </span>
                    )}
                  </div>
                  {active && nextAction && (
                    <div style={{ marginLeft: 34, marginBottom: 4, fontSize: '0.72rem', color: '#64748B', fontStyle: 'italic' }}>
                      → {nextAction}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Description">
          <p style={{ margin: 0, color: '#374151', lineHeight: 1.6, fontSize: '0.88rem' }}>{alert.description}</p>
        </Section>

        <Section title="Localisation">
          <div style={{ color: '#475569', fontSize: '0.86rem', lineHeight: 1.6 }}>
            <div>Zone : <strong style={{ color: '#0F172A', fontWeight: 600 }}>{alert.zone?.name || 'Inconnue'}</strong></div>
            {alert.latitude && <div style={{ marginTop: 3, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: '0.78rem', color: '#64748B' }}>{alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</div>}
          </div>
        </Section>

        <Section title="Informations">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem', color: '#475569' }}>
            <div>Type : <strong style={{ color: '#0F172A', fontWeight: 600 }}>{meta.label}</strong></div>
            <div>Sévérité : <strong style={{ color: sev, fontWeight: 600 }}>{SEVERITY_LABEL[alert.severity]}</strong></div>
            <div>Créé le : <strong style={{ color: '#0F172A', fontWeight: 600 }}>{new Date(alert.createdAt).toLocaleDateString('fr-FR')}</strong></div>
            {alert.broadcastAt && <div>Diffusé le : <strong style={{ color: '#0F172A', fontWeight: 600 }}>{new Date(alert.broadcastAt).toLocaleDateString('fr-FR')}</strong></div>}
            {alert.closedAt && <div>Clôturé le : <strong style={{ color: '#0F172A', fontWeight: 600 }}>{new Date(alert.closedAt).toLocaleDateString('fr-FR')}</strong></div>}
          </div>
          {alert.closureReason && <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#475569', fontStyle: 'italic' }}>Bilan : {alert.closureReason}</div>}
        </Section>

        <RecoupementSection alertId={alert.id} alertType={alert.type} />

        {alert.validations?.length > 0 && (
          <Section title="Historique des validations">
            {alert.validations.map((v: any, i: number) => (
              <div key={i} style={{ fontSize: '0.82rem', padding: '6px 10px', background: v.approved ? '#dcfce7' : '#fee2e2', borderRadius: 6, marginBottom: 6 }}>
                <strong>{v.validator?.name}</strong> ({v.validator?.role}) — {v.action || (v.approved ? 'VALIDATED' : 'REJECTED')}
                {v.step && <span style={{ color: '#94A3B8' }}> · {STEP_LABEL[v.step] || v.step}</span>}
                {v.comment && <div style={{ color: '#6b7280', marginTop: 2 }}>{v.comment}</div>}
              </div>
            ))}
          </Section>
        )}

        {/* Validation critique (ORANGE / ROUGE / ROUGE_FONCE) */}
        {isCritical && (
          <Section title="Validation critique requise">
            <CriticalValidationStatus
              alertLevel={alert.alertLevel}
              criticalValidations={alert.criticalValidations || []}
            />
            {canCriticalValidate && (
              <button
                disabled={loading}
                onClick={criticalValidate}
                style={{ ...btn('#0F172A'), width: '100%', marginTop: 12 }}
              >
                Enregistrer ma validation ({myCriticalCategory === 'SENTINELLE_CATEGORY' ? 'sentinelle' : myCriticalCategory === 'AUTORITE_LOCALE' ? 'autorité locale' : 'autorité admin'})
              </button>
            )}
            {alreadyValidatedCritical && (
              <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#15803D', textAlign: 'center', fontWeight: 500 }}>
                Vous avez déjà validé cette alerte
              </div>
            )}
          </Section>
        )}

        {/* Actions du cursus */}
        {(canAdvance || canBroadcast || canClose) && (
          <Section title="Action requise">
            {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '8px 10px', borderRadius: 6, marginBottom: 10, fontSize: '0.82rem' }}>{error}</div>}

            {canAdvance && (
              <>
                {needsProof && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                    <div style={{ fontSize: '0.78rem', color: '#92400E', marginBottom: 10, fontWeight: 500 }}>
                      Validation sentinelle : preuve obligatoire (photo + GPS + gravité)
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      {photoUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img src={photoUrl} alt="preuve" style={{ height: 60, borderRadius: 8, objectFit: 'cover', border: '1px solid #E5E7EB' }} />
                          <button onClick={() => setPhotoUrl('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '0.78rem', fontWeight: 500 }}>Supprimer</button>
                        </div>
                      ) : (
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', background: 'white', border: '1px dashed #D97706', borderRadius: 8, padding: '11px 14px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#92400E' }}>
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
                    <div style={{ fontSize: '0.74rem', color: '#A16207', marginTop: 8 }}>La position GPS sera capturée automatiquement.</div>
                  </div>
                )}
                <textarea
                  value={comment} onChange={(e) => setComment(e.target.value)}
                  placeholder="Commentaire (optionnel)" rows={2}
                  style={{ ...inputS, resize: 'none', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={loading} onClick={() => advance('VALIDATED')}
                    style={btn('#0F172A')}>Valider</button>
                  <button disabled={loading} onClick={() => advance('REJECTED')}
                    style={{ ...btn('white'), color: '#DC2626', border: '1px solid #FECACA' }}>Rejeter</button>
                </div>
                {needsProof && (
                  <button disabled={loading} onClick={() => advance('ESCALATED')}
                    style={{ ...btn('white'), color: '#EA580C', border: '1px solid #FED7AA', width: '100%', marginTop: 8 }}>
                    Escalader vers la préfecture
                  </button>
                )}
              </>
            )}

            {canBroadcast && (
              <>
                <textarea
                  value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Message de diffusion (envoyé sur tous les canaux)…" rows={3}
                  style={{ ...inputS, resize: 'vertical', marginTop: 8 }}
                />
                <button disabled={loading} onClick={broadcast}
                  style={{ ...btn('#0F172A'), width: '100%', marginTop: 8 }}>
                  Diffuser l&apos;alerte multi-canal
                </button>
              </>
            )}

            {/* Bouton diffusion d'urgence — visible MAIRIE+ tant que l'alerte n'est pas diffusée */}
            {!alert.broadcastAt && ['MAIRIE','PREFECTURE','GOUVERNORAT','PROTECTION_CIVILE','SUPERVISEUR_REGIONAL','ADMIN','SUPER_ADMIN'].includes(currentUser?.role) && (
              <button disabled={loading} onClick={emergencyBypass}
                style={{ ...btn('#DC2626'), width: '100%', marginTop: 12, padding: '11px', fontWeight: 600, letterSpacing: '-0.005em' }}>
                Diffusion d&apos;urgence — court-circuit cursus
              </button>
            )}
            {alert.emergencyBypass && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: '0.78rem', color: '#991B1B' }}>
                Diffusée en urgence — justification : « {alert.bypassJustification} »
              </div>
            )}
            {alert.autoEscalated && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: '0.78rem', color: '#92400E' }}>
                Auto-diffusée faute de confirmation autorité dans le délai (15 min)
              </div>
            )}

            {canClose && (
              <>
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Raison / bilan de clôture (obligatoire)" style={{ ...inputS, marginTop: 8 }} />
                <button disabled={loading} onClick={close}
                  style={{ ...btn('#0F172A'), width: '100%', marginTop: 8 }}>
                  Clôturer l&apos;alerte
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
  width: '100%', padding: '10px 12px', border: '1px solid #E5E7EB',
  borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box', fontFamily: 'inherit',
  background: 'white', color: '#0F172A',
};
const btn = (bg: string): React.CSSProperties => ({
  flex: 1, background: bg, color: 'white', border: 'none', padding: '10px',
  borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
  letterSpacing: '-0.005em',
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

// ── RecoupementSection ──────────────────────────────────────────────────────
// Affiche les signalements proches (cluster) + données OMVS (niveau fleuve)
// pour aider la mairie à décider du niveau de gravité et de l'urgence.
interface ContextData {
  radiusKm: number;
  windowHours: number;
  nearbySignalements: Array<{
    id: string; type: string; text: string; severity?: number | null;
    status: string; createdAt: string; channel: string;
    user: { name: string } | null;
    distanceKm: number;
  }>;
  cluster: boolean;
  omvs: {
    relevant: boolean; mock: boolean; source: string; station: string;
    riverLevelMeters: number; alertThresholdMeters: number; dangerThresholdMeters: number;
    status: 'normal' | 'vigilance' | 'alerte' | 'danger';
    flowRateM3s: number; notice: string;
  };
}

function RecoupementSection({ alertId, alertType }: { alertId: string; alertType: string }) {
  const [ctx, setCtx] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    axios
      .get(`${API}/alerts/${alertId}/context`, { headers: { Authorization: `Bearer ${localStorage.getItem('olel_token')}` } })
      .then(({ data }) => { if (!cancelled) setCtx(data); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.message || 'Recoupement indisponible'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [alertId]);

  if (loading) {
    return (
      <Section title="Recoupement">
        <div style={{ fontSize: '0.82rem', color: '#94A3B8' }}>Analyse en cours…</div>
      </Section>
    );
  }
  if (error || !ctx) {
    return (
      <Section title="Recoupement">
        <div style={{ fontSize: '0.82rem', color: '#94A3B8' }}>{error || 'Données indisponibles'}</div>
      </Section>
    );
  }

  const { nearbySignalements, cluster, omvs, radiusKm, windowHours } = ctx;
  const showOmvs = omvs.relevant;
  const statusColor: Record<string, string> = {
    normal:    '#16A34A',
    vigilance: '#D89A1D',
    alerte:    '#EA580C',
    danger:    '#DC2626',
  };
  const statusLabel: Record<string, string> = {
    normal: 'Normal', vigilance: 'Vigilance', alerte: 'Alerte', danger: 'Danger',
  };

  return (
    <Section title="Recoupement">
      {/* Bandeau cluster */}
      <div style={{
        padding: '12px 14px',
        background: cluster ? '#FFFBEB' : '#F0FDF4',
        border: '1px solid ' + (cluster ? '#FDE68A' : '#BBF7D0'),
        borderRadius: 10, marginBottom: 12,
      }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: cluster ? '#92400E' : '#15803D', letterSpacing: '-0.005em' }}>
          {cluster
            ? `${nearbySignalements.length} signalements similaires dans la zone`
            : 'Pas d\'autre signalement récent dans la zone'}
        </div>
        <div style={{ fontSize: '0.74rem', color: cluster ? '#A16207' : '#16A34A', marginTop: 3 }}>
          Rayon {radiusKm} km · {windowHours} dernières heures
        </div>
      </div>

      {/* Liste signalements proches (top 5) */}
      {nearbySignalements.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {nearbySignalements.slice(0, 5).map((s) => (
            <div key={s.id} style={{ background: '#FAFAFA', border: '1px solid #F1F5F9', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A' }}>{s.type}</span>
                <span style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>{s.distanceKm.toFixed(1)} km</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.text}</div>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 2 }}>
                {s.user?.name || 'Anonyme'} · {s.channel} · {new Date(s.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          {nearbySignalements.length > 5 && (
            <div style={{ fontSize: '0.74rem', color: '#94A3B8', textAlign: 'center', padding: '4px 0' }}>
              + {nearbySignalements.length - 5} autres
            </div>
          )}
        </div>
      )}

      {/* Carte OMVS si pertinent */}
      {showOmvs && (
        <div style={{
          background: 'white', border: '1px solid #F1F5F9', borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B', letterSpacing: '0.02em' }}>OMVS · {omvs.station}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600, color: statusColor[omvs.status], background: statusColor[omvs.status] + '14', padding: '2px 8px', borderRadius: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor[omvs.status] }} />
              {statusLabel[omvs.status]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 6 }}>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>{omvs.riverLevelMeters.toFixed(2)} m</div>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 2 }}>Niveau fleuve</div>
            </div>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>{omvs.flowRateM3s} <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 500 }}>m³/s</span></div>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 2 }}>Débit</div>
            </div>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 10, lineHeight: 1.4 }}>
            Seuils : alerte {omvs.alertThresholdMeters.toFixed(2)} m · danger {omvs.dangerThresholdMeters.toFixed(2)} m
            {omvs.mock && <div style={{ color: '#A16207', marginTop: 2 }}>⚠ {omvs.notice}</div>}
          </div>
        </div>
      )}

      {/* Note explicite quand OMVS n'est pas affiché */}
      {!showOmvs && (
        <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontStyle: 'italic' }}>
          Données OMVS non pertinentes pour ce type d&apos;alerte ({alertType}).
        </div>
      )}
    </Section>
  );
}
