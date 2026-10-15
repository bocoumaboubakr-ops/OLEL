'use client';
/**
 * File hors connexion des signalements (audit F13, F15).
 *
 * - Chaque élément est rattaché au compte qui l'a créé (`ownerId`) : il n'est
 *   jamais envoyé avec la session d'un autre compte (téléphone partagé) ni
 *   affiché à un autre compte.
 * - Seul le contrat de l'API est envoyé (le payload est stocké à part des
 *   champs internes de la file) avec un `clientRequestId` stable : un rejeu
 *   répété ne crée jamais de doublon côté serveur.
 * - Coupure réseau / serveur indisponible → l'élément reste en attente.
 *   Refus définitif (4xx) → l'élément passe « refusé », avec le motif,
 *   visible par le citoyen qui peut le supprimer.
 * - Un verrou empêche deux rejeux simultanés (plusieurs événements « online »).
 *
 * Limite connue : les photos/vocaux sont téléversés au moment de la capture ;
 * hors connexion, le signalement part sans média.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const DB_NAME = 'olel_offline';
const DB_VERSION = 2;
const STORE = 'reports';
const LEGACY_STORE = 'signalements';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const CHANGED = 'olel-offline-queue-changed';

export interface QueuedReport {
  key: string;                       // = clientRequestId
  ownerId: string;
  payload: Record<string, unknown>;  // contrat CreateAlertDto uniquement
  createdAt: string;
  attempts: number;
  state: 'pending' | 'rejected';
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('ownerId', 'ownerId');
      }
      // Ancienne file sans auteur ni identifiant de requête : ses éléments ne
      // peuvent pas être attribués de façon sûre — ils sont abandonnés.
      if (db.objectStoreNames.contains(LEGACY_STORE)) db.deleteObjectStore(LEGACY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED)); };

export function newClientRequestId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export function currentUserId(): string | null {
  try { return JSON.parse(localStorage.getItem('olel_user') || 'null')?.id ?? null; } catch { return null; }
}

/** Met un signalement en attente pour le compte connecté. Le payload doit contenir clientRequestId. */
export async function queueSignalement(payload: Record<string, unknown> & { clientRequestId: string }) {
  const ownerId = currentUserId();
  if (!ownerId) throw new Error('Connexion requise pour enregistrer un signalement');
  const item: QueuedReport = { key: payload.clientRequestId, ownerId, payload, createdAt: new Date().toISOString(), attempts: 0, state: 'pending' };
  await tx('readwrite', (s) => s.put(item));
  notify();
}

export async function listQueued(ownerId: string): Promise<QueuedReport[]> {
  const all = (await tx<QueuedReport[]>('readonly', (s) => s.index('ownerId').getAll(ownerId))) ?? [];
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueued(key: string) {
  await tx('readwrite', (s) => s.delete(key));
  notify();
}

/** Supprime les éléments d'un compte (déconnexion sur téléphone partagé). */
export async function purgeQueued(ownerId: string) {
  for (const item of await listQueued(ownerId)) await tx('readwrite', (s) => s.delete(item.key));
  notify();
}

let flushing = false;

/** Envoie les éléments en attente du compte connecté. Retourne le nombre envoyé. */
export async function flushQueue(): Promise<number> {
  if (flushing || typeof navigator === 'undefined' || !navigator.onLine) return 0;
  const ownerId = currentUserId();
  const token = localStorage.getItem('olel_token');
  if (!ownerId || !token) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of await listQueued(ownerId)) {
      if (item.state !== 'pending') continue;
      // La session a pu changer pendant le rejeu : on s'arrête net
      if (currentUserId() !== ownerId) break;
      try {
        await axios.post(`${API}/alerts`, item.payload, {
          headers: { Authorization: `Bearer ${localStorage.getItem('olel_token')}` }, timeout: 20000,
        });
        await tx('readwrite', (s) => s.delete(item.key));
        sent++;
      } catch (e: any) {
        const status = e?.response?.status as number | undefined;
        if (status && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) {
          const msg = e.response?.data?.message;
          await tx('readwrite', (s) => s.put({ ...item, attempts: item.attempts + 1, state: 'rejected', lastError: Array.isArray(msg) ? msg.join(', ') : String(msg || `Refusé (${status})`) }));
        } else {
          await tx('readwrite', (s) => s.put({ ...item, attempts: item.attempts + 1, lastError: status ? `Serveur indisponible (${status})` : 'Réseau indisponible' }));
          break; // coupure : inutile d'insister sur les suivants
        }
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return sent;
}

/** Hook : rejoue la file au retour du réseau et expose les éléments du compte connecté. */
export function useOfflineQueue(userId: string | null | undefined) {
  const [items, setItems] = useState<QueuedReport[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) { setItems([]); return; }
    try { setItems(await listQueued(userId)); } catch { setItems([]); }
  }, [userId]);

  const flush = useCallback(async () => { await flushQueue(); await refresh(); }, [refresh]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    flush();
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'SYNC_SIGNALEMENTS') flush(); };
    window.addEventListener('online', flush);
    window.addEventListener(CHANGED, refresh);
    navigator.serviceWorker?.addEventListener?.('message', onMsg);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener(CHANGED, refresh);
      navigator.serviceWorker?.removeEventListener?.('message', onMsg);
    };
  }, [userId, flush, refresh]);

  return { items, flush, remove: async (key: string) => { await removeQueued(key); await refresh(); } };
}
