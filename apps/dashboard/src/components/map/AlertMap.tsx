'use client';

import { useEffect, useRef } from 'react';

export function AlertMap({ alerts }: { alerts: any[] }) {
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    import('leaflet').then((L) => {
      if (mapRef.current) return;

      mapRef.current = L.map('alert-map', {
        center: [15.6556, -13.2553],
        zoom: 8,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(mapRef.current);
    });
  }, []);

  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return;

    import('leaflet').then((L) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      alerts.forEach((alert) => {
        if (!alert.latitude || !alert.longitude) return;

        const color = alert.severity >= 3 ? 'red' : alert.severity === 2 ? 'orange' : 'green';
        const icon = L.divIcon({
          html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5)"></div>`,
          iconSize: [18, 18],
          className: '',
        });

        const marker = L.marker([alert.latitude, alert.longitude], { icon })
          .addTo(mapRef.current)
          .bindPopup(`<b>${alert.title}</b><br>${alert.description}<br><small>${alert.zone?.name || ''}</small>`);

        markersRef.current.push(marker);
      });
    });
  }, [alerts]);

  return <div id="alert-map" style={{ width: '100%', height: '100%' }} />;
}
