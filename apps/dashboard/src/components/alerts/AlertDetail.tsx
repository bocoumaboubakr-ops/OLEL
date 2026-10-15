'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

import { TYPE_META, SEVERITY_COLOR, SEVERITY_LABEL, STATUS_STYLE, WORKFLOW_STEPS, STEP_LABEL } from './AlertsFeed';
import { AlertLevelBadge } from '@/components/governance/AlertLevelBadge';
import { authHeader } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Étape courante normalisée (anciennes étapes encore présentes en base)
const PHASE_OF: Record<string, string> = { SENTINELLE: 'SIGNALEMENT', COORDINATEUR: 'MAIRIE', GOUVERNANCE: 'PREFECTURE' };

// Message d'aide affiché sous l'étape active (circuit v3)
const STEP_NEXT_ACTION: Record<string, string> = {
  SIGNALEMENT: 'Vérification terrain par une sentinelle (photo + position GPS + gravité, depuis l\'application mobile)',
  MAIRIE:      'La mairie valide : diffusion directe jusqu\'au niveau ORANGE, confirmation préfectorale pour ROUGE+',
  PREFECTURE:  'L\'autorité confirme et diffuse (une autre personne que l\'auteur et les validateurs précédents)',
  BROADCAST:   'Alerte diffusée — la mairie peut clôturer avec un bilan',
  CLOSED:      'Alerte clôturée',
};

type Decision = { allowed: boolean; reason?: string };
interface Actions {
  validate: Decision; reject: Decision; broadcast: Decision; emergencyBypass: Decision;
  close: Decision; medicalClearance: Decision; reviewBypass: Decision;
  correction: Decision; retract: Decision; minRetractionReason: number;
  requiresFieldProof: boolean;
  onValidate: { nextStep: string; diffuses: boolean } | null;
  minBypassJustification: number;
}

export function AlertDetail({ alert: summary, currentUser, onClose, onRefetch }: {
  alert: any;
  currentUser: any;
  onClose: () => void;
  onRefetch: () => void;
}) {
  // Le détail (et les actions autorisées) vient du serveur : même règle que l'API (audit F14)
  const [alert, setAlert] = useState<any>(summary);
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [correctionMsg, setCorrectionMsg] = useState('');

  const loadDetail = async () => {
    try {
      const { data } = await axios.get(`${API}/alerts/${summary.id}`, { headers: authHeader() });
      setAlert(data); setDetailError('');
    } catch (e: any) {
      setDetailError(e.response?.status === 404 ? 'Alerte hors de votre périmètre ou supprimée' : 'Détail indisponible — actions désactivées');
    }
  };
  // Recharge le détail quand on change d'alerte (et seulement alors)
  useEffect(() => {
    setAlert(summary);
    loadDetail();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.id]);

  const actions: Actions | undefined = alert.actions;
  const meta = TYPE_META[alert.type] || TYPE_META.AUTRE;
  const sev = SEVERITY_COLOR[alert.severity] || '#888';
  const status = STATUS_STYLE[alert.status] || STATUS_STYLE.PENDING;
  const step = PHASE_OF[alert.currentStep] || alert.currentStep || 'SIGNALEMENT';
  void currentUser;

  const run = async (fn: () => Promise<any>, closeAfter = true) => {
    setLoading(true); setError('');
    try { await fn(); onRefetch(); if (closeAfter) onClose(); else await loadDetail(); }
    catch (e: any) { setError(e.response?.data?.message || e.message || 'Erreur'); await loadDetail(); }
    finally { setLoading(false); }
  };

  const advance = (action: 'VALIDATED' | 'REJECTED') => run(async () => {
    if (action === 'VALIDATED' && actions?.onValidate?.diffuses
      && !window.confirm('Cette validation DÉCLENCHE la diffusion aux citoyens de la zone. Confirmer ?')) return;
    await axios.post(`${API}/alerts/${alert.id}/advance`, { action, comment: comment || undefined }, { headers: authHeader() });
  });

  const broadcast = () => run(async () => {
    if (!broadcastMsg.trim()) throw new Error('Message de diffusion obligatoire (texte exact envoyé aux citoyens)');
    await axios.post(`${API}/alerts/${alert.id}/broadcast`, { message: broadcastMsg.trim(), idempotencyKey: `${alert.id}:${crypto.randomUUID()}` }, { headers: authHeader() });
  });

  const emergencyBypass = () => run(async () => {
    const min = actions?.minBypassJustification ?? 20;
    const justification = window.prompt(
      `DIFFUSION D'URGENCE\n\nDiffuse MAINTENANT, avec la mention « vérification en cours ».\nUne revue a posteriori par une autre autorité sera exigée.\n\nJustification (obligatoire, ≥ ${min} caractères) :`,
    );
    if (!justification || justification.trim().length < min) throw new Error(`Justification trop courte (≥ ${min} caractères requis)`);
    if (!window.confirm(`Diffuser cette alerte EN URGENCE avec la justification :\n« ${justification.trim()} » ?`)) return;
    await axios.post(`${API}/alerts/${alert.id}/emergency-bypass`, { justification: justification.trim() }, { headers: authHeader() });
  });
  const close = () => run(() => axios.post(`${API}/alerts/${alert.id}/close`, { reason }, { headers: authHeader() }));
  const medicalClearance = () => run(() => axios.post(`${API}/alerts/${alert.id}/medical-clearance`, {}, { headers: authHeader() }), false);
  const reviewBypass = () => run(() => axios.post(`${API}/alerts/${alert.id}/bypass-review`, { note: reviewNote }, { headers: authHeader() }), false);

  const correction = () => run(async () => {
    if (correctionMsg.trim().length < 10) throw new Error('Texte du rectificatif : 10 caractères minimum (texte exact envoyé)');
    if (!window.confirm('Envoyer ce RECTIFICATIF à tous les destinataires de l\'alerte ?')) return;
    await axios.post(`${API}/alerts/${alert.id}/correction`, { message: correctionMsg.trim(), idempotencyKey: `${alert.id}:corr:${crypto.randomUUID()}` }, { headers: authHeader() });
  }, false);

  const retract = () => run(async () => {
    const min = actions?.minRetractionReason ?? 20;
    const reason = window.prompt(`RETRAIT DE L'ALERTE (fausse alerte)\n\nL'alerte sera annulée et un message « ALERTE ANNULÉE » partira vers tous ses destinataires.\n\nMotif (tracé, ≥ ${min} caractères) :`);
    if (!reason || reason.trim().length < min) throw new Error(`Motif trop court (≥ ${min} caractères)`);
    const message = window.prompt('Message aux destinataires (laisser vide pour le texte par défaut : « L\'alerte … est annulée. Les consignes précédentes ne s\'appliquent plus. ») :') ?? '';
    if (!window.confirm('Confirmer le RETRAIT de cette alerte ?')) return;
    await axios.post(`${API}/alerts/${alert.id}/retract`, { reason: reason.trim(), message: message.trim() || undefined }, { headers: authHeader() });
  });

  const anyAction = !!actions && (actions.validate.allowed || actions.reject.allowed || actions.broadcast.allowed
    || actions.emergencyBypass.allowed || actions.close.allowed || actions.medicalClearance.allowed || actions.reviewBypass.allowed
    || actions.correction?.allowed || actions.retract?.allowed);

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

        {actions && <DiffusionsSection alertId={alert.id} refreshKey={alert.updatedAt} />}

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

        {detailError && (
          <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 10px', borderRadius: 6, marginBottom: 12, fontSize: '0.8rem' }}>{detailError}</div>
        )}

        {alert.requiresMedicalReview && (
          <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, fontSize: '0.78rem', color: '#9A3412' }}>
            Revue médicale requise : aucune diffusion (y compris d&apos;urgence) avant levée par l&apos;autorité sanitaire désignée.
          </div>
        )}
        {alert.emergencyBypass && (
          <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: '0.78rem', color: '#991B1B' }}>
            Diffusée en urgence — justification : « {alert.bypassJustification} »
            <div style={{ marginTop: 4 }}>{alert.bypassReviewedAt ? `Revue a posteriori effectuée : « ${alert.bypassReviewNote} »` : 'Revue a posteriori en attente.'}</div>
          </div>
        )}
        {alert.autoEscalated && (
          <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: '0.78rem', color: '#92400E' }}>
            Diffusée automatiquement, NON confirmée par l&apos;autorité dans le délai (mention portée dans le message).
          </div>
        )}

        {/* Actions : uniquement celles que le serveur autorise pour vous */}
        {actions && (
          <Section title="Actions">
            {error && <div style={{ background: '#fee2e2', color: '#DC2626', padding: '8px 10px', borderRadius: 6, marginBottom: 10, fontSize: '0.82rem' }}>{error}</div>}
            {!anyAction && (
              <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                Aucune action possible pour vous sur cette alerte.
                {actions.validate.reason && <div style={{ marginTop: 4, color: '#94A3B8' }}>{actions.validate.reason}</div>}
              </div>
            )}

            {actions.requiresFieldProof && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: '0.78rem', color: '#92400E' }}>
                Vérification terrain requise : une sentinelle valide depuis l&apos;application mobile avec photo, position GPS capturée sur place et gravité.
                Le tableau de bord ne fabrique jamais de position (audit F18).
              </div>
            )}

            {(actions.validate.allowed || actions.reject.allowed) && (
              <>
                <textarea
                  value={comment} onChange={(e) => setComment(e.target.value)}
                  placeholder="Commentaire (optionnel)" rows={2}
                  style={{ ...inputS, resize: 'none', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  {actions.validate.allowed && !actions.requiresFieldProof && (
                    <button disabled={loading} onClick={() => advance('VALIDATED')} style={btn('#0F172A')}>
                      {actions.onValidate?.diffuses ? 'Valider et diffuser' : 'Valider (vers confirmation)'}
                    </button>
                  )}
                  {actions.reject.allowed && (
                    <button disabled={loading} onClick={() => advance('REJECTED')}
                      style={{ ...btn('white'), color: '#DC2626', border: '1px solid #FECACA' }}>Rejeter</button>
                  )}
                </div>
              </>
            )}

            {actions.broadcast.allowed && (
              <>
                <textarea
                  value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Consigne approuvée (texte exact envoyé, sans traduction automatique)…" rows={3}
                  style={{ ...inputS, resize: 'vertical', marginTop: 8 }}
                />
                <button disabled={loading} onClick={broadcast} style={{ ...btn('#0F172A'), width: '100%', marginTop: 8 }}>
                  Confirmer et diffuser
                </button>
              </>
            )}

            {actions.medicalClearance.allowed && (
              <button disabled={loading} onClick={medicalClearance} style={{ ...btn('#9A3412'), width: '100%', marginTop: 8 }}>
                Lever la revue médicale
              </button>
            )}

            {actions.reviewBypass.allowed && (
              <>
                <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Note de revue de la diffusion d'urgence (≥ 10 caractères)" style={{ ...inputS, marginTop: 8 }} />
                <button disabled={loading} onClick={reviewBypass} style={{ ...btn('#0F172A'), width: '100%', marginTop: 8 }}>
                  Enregistrer la revue a posteriori
                </button>
              </>
            )}

            {actions.emergencyBypass.allowed && (
              <button disabled={loading} onClick={emergencyBypass}
                style={{ ...btn('#DC2626'), width: '100%', marginTop: 12, padding: '11px', fontWeight: 600, letterSpacing: '-0.005em' }}>
                Diffusion d&apos;urgence (justification, revue a posteriori)
              </button>
            )}

            {actions.correction?.allowed && (
              <>
                <textarea
                  value={correctionMsg} onChange={(e) => setCorrectionMsg(e.target.value)}
                  placeholder="Rectificatif (texte exact envoyé aux mêmes destinataires, mention RECTIFICATIF)…" rows={2}
                  style={{ ...inputS, resize: 'vertical', marginTop: 12 }}
                />
                <button disabled={loading} onClick={correction} style={{ ...btn('#1D4ED8'), width: '100%', marginTop: 8 }}>
                  Diffuser un rectificatif
                </button>
              </>
            )}

            {actions.retract?.allowed && (
              <button disabled={loading} onClick={retract}
                style={{ ...btn('white'), color: '#B91C1C', border: '1px solid #FECACA', width: '100%', marginTop: 8 }}>
                Retirer l&apos;alerte (fausse alerte)
              </button>
            )}

            {actions.close.allowed && (
              <>
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Raison / bilan de clôture (obligatoire)" style={{ ...inputS, marginTop: 8 }} />
                <button disabled={loading} onClick={close} style={{ ...btn('#0F172A'), width: '100%', marginTop: 8 }}>
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

// ── DiffusionsSection ───────────────────────────────────────────────────────
// Suivi réel des diffusions : « envoyé » (accepté par le fournisseur) n'est
// pas « livré » (confirmé par le fournisseur) ni « lu ».
const KIND_LABEL: Record<string, string> = {
  PRIMARY: 'Diffusion', CORRECTION: 'Rectificatif', RETRACTION: 'Retrait', PREALERT: 'Pré-alerte', INTERNAL: 'Notification opérateurs',
};
const DELIVERY_LABEL: Record<string, string> = {
  SENT: 'envoyé', DELIVERED: 'livré', READ: 'lu', FAILED: 'échec', SKIPPED: 'non éligible', SIMULATED: 'simulé', QUEUED: 'en cours',
};

function DiffusionsSection({ alertId, refreshKey }: { alertId: string; refreshKey?: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    axios.get(`${API}/alerts/${alertId}/broadcasts`, { headers: authHeader() })
      .then(({ data }) => { setRows(data); setError(''); })
      .catch(() => setError('Suivi des diffusions indisponible'));
  }, [alertId, refreshKey]);
  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    try { const { data } = await axios.get(`${API}/alerts/broadcasts/${id}/deliveries?limit=100`, { headers: authHeader() }); setItems(data.items); }
    catch { setItems([]); }
  };
  if (error) return <Section title="Diffusions"><div style={{ fontSize: '0.8rem', color: '#991B1B' }}>{error}</div></Section>;
  const visible = (rows || []).filter((b) => b.kind !== 'INTERNAL');
  if (!rows || !visible.length) return null;
  return (
    <Section title="Diffusions et remises">
      {visible.map((b) => (
        <div key={b.id} style={{ border: '1px solid #F1F5F9', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ color: '#0F172A' }}>{KIND_LABEL[b.kind] || b.kind}{b.sequence ? ` n° ${b.sequence}` : ''}</strong>
            <span style={{ color: b.status === 'DONE' ? '#15803D' : b.status === 'FAILED' ? '#B91C1C' : '#92400E', fontWeight: 600 }}>{b.status}</span>
          </div>
          <div style={{ color: '#64748B', marginTop: 2 }}>
            {new Date(b.createdAt).toLocaleString('fr-FR')} · {b.author?.name || '—'} · {b.totalRecipients} destinataire(s)
          </div>
          {Object.entries(b.byChannel as Record<string, Record<string, number>>).map(([ch, st]) => (
            <div key={ch} style={{ color: '#475569', marginTop: 2 }}>
              {ch} : {Object.entries(st).map(([k, n]) => `${n} ${DELIVERY_LABEL[k] || k}`).join(' · ')}
            </div>
          ))}
          {b.lastError && <div style={{ color: '#B91C1C', marginTop: 2 }}>{b.lastError}</div>}
          <button onClick={() => toggle(b.id)} style={{ background: 'none', border: 'none', color: '#1D4ED8', cursor: 'pointer', padding: 0, marginTop: 4, fontSize: '0.76rem' }}>
            {open === b.id ? 'Masquer le détail' : 'Détail par destinataire'}
          </button>
          {open === b.id && (
            <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
              {items.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, color: '#475569' }}>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{d.recipient} · {d.channel}</span>
                  <span title={d.error || ''}>{DELIVERY_LABEL[d.status] || d.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

// ── RecoupementSection ──────────────────────────────────────────────────────
// Affiche les signalements proches (cluster) ; aucune donnée hydrologique
// n'est inventée tant qu'aucune source n'est connectée.
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
  omvs: { relevant: boolean; available: boolean; notice: string };
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

      {/* Hydrologie : aucune source connectée, aucune valeur fabriquée (audit F18/F35) */}
      {omvs.relevant && (
        <div style={{ fontSize: '0.74rem', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px' }}>
          {omvs.notice}
        </div>
      )}
    </Section>
  );
}
