'use client';
/**
 * Session côté navigateur (audit F13).
 *
 * Le jeton d'accès vit 15 minutes : sur une réponse 401, un SEUL
 * rafraîchissement est lancé (partagé par toutes les requêtes en attente),
 * puis la requête est rejouée. Si un autre onglet a déjà renouvelé la
 * session, on réutilise son jeton au lieu de rejouer un jeton de
 * rafraîchissement déjà consommé (détection de réutilisation côté serveur).
 * La déconnexion révoque la session côté serveur puis purge le stockage.
 */
import axios, { AxiosInstance } from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const K = { access: 'olel_token', refresh: 'olel_refresh', user: 'olel_user' } as const;

type Tokens = { accessToken: string; refreshToken: string; user?: unknown };

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

export const getAccessToken = () => read(K.access);
export const authHeader = () => ({ Authorization: `Bearer ${getAccessToken() ?? ''}` });

export function storeSession(data: Tokens) {
  localStorage.setItem(K.access, data.accessToken);
  localStorage.setItem(K.refresh, data.refreshToken);
  if (data.user) localStorage.setItem(K.user, JSON.stringify(data.user));
}

export function clearLocalSession() {
  for (const k of Object.values(K)) { try { localStorage.removeItem(k); } catch { /* stockage indisponible */ } }
}

const loggedOutListeners = new Set<() => void>();
/** Appelé quand la session ne peut plus être renouvelée (révoquée, expirée, suspendue). */
export function onSessionLost(fn: () => void): () => void { loggedOutListeners.add(fn); return () => { loggedOutListeners.delete(fn); }; }

let inflight: Promise<string | null> | null = null;

/** Renouvelle le jeton d'accès. null si la session est perdue (ou réseau indisponible). */
export function refreshAccessToken(): Promise<string | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    const refreshToken = read(K.refresh);
    if (!refreshToken) return null;
    try {
      const { data } = await axios.post(`${API}/auth/refresh`, { refreshToken }, { timeout: 15000, _olelNoRetry: true } as never);
      storeSession(data);
      return data.accessToken as string;
    } catch (e: any) {
      if (!e?.response) return null; // réseau : on garde la session pour plus tard
      // Un autre onglet a pu renouveler entre-temps : son jeton est valable
      if (read(K.refresh) !== refreshToken && read(K.access)) return read(K.access);
      clearLocalSession();
      loggedOutListeners.forEach((fn) => fn());
      return null;
    }
  })().finally(() => { setTimeout(() => { inflight = null; }, 0); });
  return inflight;
}

const installed = new WeakSet<AxiosInstance>();

/** Installe le renouvellement automatique sur une instance axios (idempotent). */
export function installAuthRefresh(instance: AxiosInstance = axios) {
  if (typeof window === 'undefined' || installed.has(instance)) return;
  installed.add(instance);
  instance.interceptors.response.use(undefined, async (error) => {
    const cfg = error?.config;
    if (!cfg || error?.response?.status !== 401 || cfg._olelNoRetry || cfg._olelRetried) throw error;
    if (String(cfg.url ?? '').includes('/auth/')) throw error;
    cfg._olelRetried = true;
    const sent = String(cfg.headers?.Authorization ?? cfg.headers?.authorization ?? '').replace(/^Bearer /, '');
    const current = read(K.access);
    // Jeton déjà renouvelé (autre requête ou autre onglet) : rejouer directement
    const token = current && current !== sent ? current : await refreshAccessToken();
    if (!token) throw error;
    cfg.headers = { ...(cfg.headers ?? {}), Authorization: `Bearer ${token}` };
    return instance.request(cfg);
  });
}

/** Déconnexion : révocation serveur (au mieux) puis purge locale. */
export async function logoutSession() {
  const token = read(K.access);
  if (token) {
    try { await axios.post(`${API}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 5000, _olelNoRetry: true } as never); }
    catch { /* hors ligne : la session expirera ; le stockage local est purgé quand même */ }
  }
  clearLocalSession();
}
