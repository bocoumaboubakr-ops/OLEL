'use client';

import { useEffect, useRef } from 'react';
import { TYPE_META, SEVERITY_COLOR } from '@/components/alerts/AlertsFeed';

export function AlertMap({ alerts, selected, onSelect }: { alerts: any[]; selected?: any; onSelect?: (a: any) => void }) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined' || mapRef.current) return;

    import('leaflet').then((L) => {
      mapRef.current = L.map('alert-map', { center: [15.6556, -13.2553], zoom: 9 });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap | OLEL Matam',
        maxZoom: 18,
      }).addTo(mapRef.current);

      // Cercle zone Matam
      L.circle([15.6556, -13.2553], { radius: 50000, color: '#1a3c5e', fillColor: '#1a3c5e', fillOpacity: 0.05, weight: 1.5, dashArray: '6' })
        .addTo(mapRef.current);
    });
  }, []);

  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return;

    import('leaflet').then((L) => {
      // Supprimer marqueurs obsolètes
      const currentIds = new Set(alerts.map((a) => a.id));
      markersRef.current.forEach((marker, id) => {
        if (!currentIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });

      alerts.forEach((alert) => {
        if (!alert.latitude || !alert.longitude) return;

        const color = SEVERITY_COLOR[alert.severity] || '#888';
        const meta = TYPE_META[alert.type] || TYPE_META.AUTRE;
        const isSelected = selected?.id === alert.id;

        const icon = L.divIcon({
          html: `<div style="
            background:${color};
            width:${isSelected ? 22 : 14}px;
            height:${isSelected ? 22 : 14}px;
            border-radius:50%;
            border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.35);
            display:flex;align-items:center;justify-content:center;
            font-size:${isSelected ? '10px' : '0'};
            transition:all 0.2s;
          ">${isSelected ? meta.icon : ''}</div>`,
          iconSize: [isSelected ? 22 : 14, isSelected ? 22 : 14],
          className: '',
        });

        if (markersRef.current.has(alert.id)) {
          markersRef.current.get(alert.id).setIcon(icon);
        } else {
          const marker = L.marker([alert.latitude, alert.longitude], { icon })
            .addTo(mapRef.current)
            .bindPopup(`
              <div style="font-family:system-ui;min-width:180px">
                <b style="color:#1a3c5e">${meta.icon} ${alert.title}</b>
                <p style="margin:6px 0 4px;font-size:12px;color:#555">${alert.description}</p>
                <div style="font-size:11px;color:#888">📍 ${alert.zone?.name || ''}</div>
              </div>
            `);

          marker.on('click', () => onSelect?.(alert));
          markersRef.current.set(alert.id, marker);
        }
      });

      // Centrer sur l'alerte sélectionnée
      if (selected?.latitude && selected?.longitude) {
        mapRef.current.setView([selected.latitude, selected.longitude], 12, { animate: true });
      }
    });
  }, [alerts, selected, onSelect]);

  return <div id="alert-map" style={{ width: '100%', height: '100%', background: '#e8f0fe' }} />;
}
