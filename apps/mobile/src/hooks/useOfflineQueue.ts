'use client';
import { useEffect, useCallback } from 'react';
import axios from 'axios';

const DB_NAME = 'olel_offline';
const STORE_NAME = 'signalements';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueSignalement(payload: Record<string, any>) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ ...payload, queuedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPending(): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteItem(id: number) {
  const db = await openDb();
  return new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
  });
}

/** Hook qui tente de vider la queue dès que le réseau revient. */
export function useOfflineQueue() {
  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const token = localStorage.getItem('olel_token');
    if (!token) return;
    let items: any[] = [];
    try { items = await getPending(); } catch { return; }

    for (const item of items) {
      try {
        await axios.post(`${API}/alerts`, item, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
        await deleteItem(item.id);
      } catch { /* réseau encore indisponible — réessai au prochain événement */ }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('online', flush);
    flush();
    return () => window.removeEventListener('online', flush);
  }, [flush]);
}
