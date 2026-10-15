'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { authHeader } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface SystemInfo {
  pilotMode: boolean;
  allowlistSize: number;
  channels: { whatsapp: boolean; sms: boolean };
  automations: { prealert: boolean; autoEscalation: boolean; whatsappTemplates: boolean };
}

/**
 * Bandeau d'état permanent : un opérateur doit savoir, avant de décider,
 * si une diffusion peut réellement atteindre la population.
 */
export function SystemBanner() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    axios.get(`${API}/system/info`, { headers: authHeader() }).then(({ data }) => setInfo(data)).catch(() => setInfo(null));
  }, []);
  if (!info) return null;
  const msgs: { text: string; tone: 'warn' | 'danger' }[] = [];
  if (info.pilotMode) {
    msgs.push({ tone: 'warn', text: `MODE PILOTE — les diffusions ne partent que vers ${info.allowlistSize} numéro(s) autorisé(s) ; la population n'est pas destinataire.` });
  }
  if (!info.channels.whatsapp && !info.channels.sms) {
    msgs.push({ tone: 'danger', text: 'Aucun canal de diffusion configuré : toute diffusion échouera (motif visible dans le suivi).' });
  }
  if (info.automations.autoEscalation || info.automations.prealert) {
    msgs.push({ tone: 'warn', text: `Automatismes actifs : ${[info.automations.prealert && 'pré-alerte', info.automations.autoEscalation && 'auto-escalade ROUGE'].filter(Boolean).join(', ')} (messages marqués « non confirmé »).` });
  }
  if (!msgs.length) return null;
  return (
    <div role="status">
      {msgs.map((m) => (
        <div key={m.text} style={{
          padding: '8px 24px', fontSize: '0.8rem', fontWeight: 600,
          background: m.tone === 'danger' ? '#FEF2F2' : '#FFFBEB',
          color: m.tone === 'danger' ? '#991B1B' : '#92400E',
          borderBottom: `1px solid ${m.tone === 'danger' ? '#FECACA' : '#FDE68A'}`,
        }}>{m.text}</div>
      ))}
    </div>
  );
}
