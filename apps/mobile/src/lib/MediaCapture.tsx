'use client';
import { useEffect, useRef, useState } from 'react';
import { compressImage } from './compressImage';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * Capture caméra + enregistrement audio in-app pour le signalement citoyen.
 *
 * Photo : <input type="file" capture="environment"> ouvre directement la caméra
 * arrière sur mobile (fallback galerie sur desktop). Marche en HTTP.
 *
 * Audio : MediaRecorder ne fonctionne QU'EN HTTPS (ou localhost). En HTTP,
 * on désactive proprement le bouton et on suggère l'envoi via WhatsApp.
 * S'activera automatiquement le jour où le domaine + TLS sont en place.
 */
export interface CapturedMedia {
  url: string;
  type: 'image' | 'audio';
}

interface Props {
  onChange: (media: CapturedMedia[]) => void;
}

async function uploadFile(file: Blob, filename: string, kind: 'photo' | 'audio'): Promise<string | null> {
  const token = localStorage.getItem('olel_token');
  if (!token) return null;
  const form = new FormData();
  form.append('file', file, filename);
  const res = await fetch(`${API}/upload/${kind}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.url || null;
}

export function MediaCapture({ onChange }: Props) {
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [secureContext, setSecureContext] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // MediaRecorder n'est dispo qu'en contexte sécurisé (HTTPS ou localhost)
    setSecureContext(typeof window !== 'undefined' && window.isSecureContext);
  }, []);

  const update = (next: CapturedMedia[]) => {
    setMedia(next);
    onChange(next);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const compressed = await compressImage(file);
      const url = await uploadFile(compressed, `photo-${Date.now()}.jpg`, 'photo');
      if (!url) throw new Error('Upload refusé');
      update([...media, { url, type: 'image' }]);
    } catch (err: any) {
      setError(err?.message || 'Erreur upload photo');
    } finally {
      setBusy(false);
      e.target.value = ''; // reset pour permettre une nouvelle photo
    }
  };

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setBusy(true);
        try {
          const ext = (mr.mimeType || '').includes('mp4') ? '.m4a' : '.webm';
          const url = await uploadFile(blob, `voice-${Date.now()}${ext}`, 'audio');
          if (!url) throw new Error('Upload refusé');
          update([...media, { url, type: 'audio' }]);
        } catch (err: any) {
          setError(err?.message || 'Erreur upload vocal');
        } finally {
          setBusy(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch (err: any) {
      setError('Micro inaccessible : ' + (err?.message || ''));
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const remove = (url: string) => update(media.filter((m) => m.url !== url));

  const btn = (bg: string, disabled = false): React.CSSProperties => ({
    flex: 1, background: bg, color: 'white', border: 'none', padding: '10px 12px',
    borderRadius: 10, fontSize: '0.85rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <label style={btn('#1a3c5e', busy)}>
          {busy ? '⏳' : '📷'} Photo
          <input type="file" accept="image/*" capture="environment"
            onChange={handlePhoto} disabled={busy}
            style={{ display: 'none' }} />
        </label>

        {recording ? (
          <button type="button" onClick={stopRecording} style={btn('#dc2626')}>
            ⏹️ Arrêter (parlez…)
          </button>
        ) : (
          <button type="button" onClick={startRecording}
            disabled={busy || !secureContext}
            title={!secureContext ? 'Vocal in-app indisponible en HTTP — utilisez WhatsApp' : ''}
            style={btn('#0ea5e9', busy || !secureContext)}>
            🎙️ Vocal
          </button>
        )}
      </div>

      {!secureContext && (
        <div style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
          ℹ️ Pour enregistrer un vocal depuis l'app, accès HTTPS requis. En attendant, envoyez-le par WhatsApp au numéro OLEL.
        </div>
      )}

      {error && <div style={{ fontSize: '0.78rem', color: '#dc2626', background: '#fee2e2', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>{error}</div>}

      {media.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {media.map((m) => (
            <div key={m.url} style={{ position: 'relative', background: '#f1f5f9', borderRadius: 8, padding: 6 }}>
              {m.type === 'image' ? (
                <img src={m.url} alt="preuve" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
              ) : (
                <div style={{ width: 140, padding: '4px 6px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600, marginBottom: 4 }}>🎙️ Vocal</div>
                  <audio controls src={m.url} style={{ width: '100%', height: 28 }} />
                </div>
              )}
              <button type="button" onClick={() => remove(m.url)}
                style={{ position: 'absolute', top: -6, right: -6, background: '#dc2626', color: 'white', border: 'none',
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
