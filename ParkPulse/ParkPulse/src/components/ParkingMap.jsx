import { useEffect, useRef } from "react";
import { PARKING_LOTS, getLotStatus, STATUS_COLORS, computeReliability } from "../App";

export default function ParkingMap({ reports, lastRefresh, onSelectLot }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const leafletLoadedRef = useRef(false);

  // Initialize map only once
  useEffect(() => {
    if (mapInstanceRef.current) return;
    if (leafletLoadedRef.current) return;
    leafletLoadedRef.current = true;

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    if (window.L) {
      initMap();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => initMap();
    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        leafletLoadedRef.current = false;
      }
    };
  }, []);

  function initMap() {
    if (mapInstanceRef.current) return;
    if (!mapRef.current) return;

    const L = window.L;
    const map = L.map(mapRef.current, {
      center: [32.1065, 35.2120],
      zoom: 16,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
    renderMarkers([]);
  }

  function renderMarkers(currentReports) {
    const L = window.L;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove old markers
    Object.values(markersRef.current).forEach((m) => {
      try { m.remove(); } catch(e) {}
    });
    markersRef.current = {};

    PARKING_LOTS.forEach((lot) => {
      const status = getLotStatus(lot.name, currentReports);
      const color = STATUS_COLORS[status];

      const circle = L.circleMarker([lot.lat, lot.lng], {
        radius: 22,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.75,
      }).addTo(map);

      const fresh = currentReports.filter((r) => r.area === lot.name)[0];
      const reliability = fresh ? computeReliability(fresh) : null;

      const statusLabel = {
        available: "✅ פנוי",
        partial:   "🟡 חלקי",
        full:      "🔴 מלא",
        unknown:   "❓ לא ידוע",
      }[status];

      const popupHtml = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;direction:rtl;min-width:180px">
          <h3 style="margin:0 0 6px;font-size:15px">${lot.name}</h3>
          <div style="display:inline-block;padding:3px 10px;border-radius:20px;background:${color};color:white;font-size:12px;font-weight:600;margin-bottom:8px">${statusLabel}</div>
          ${reliability !== null ? `
            <div style="margin-top:6px">
              <div style="font-size:11px;color:#666;margin-bottom:3px">אמינות דיווח</div>
              <div style="background:#eee;border-radius:10px;height:8px;overflow:hidden">
                <div style="width:${reliability}%;background:${reliability>60?"#22c55e":reliability>30?"#f59e0b":"#ef4444"};height:100%;border-radius:10px"></div>
              </div>
              <div style="font-size:12px;color:#333;margin-top:3px;font-weight:600">${reliability}%</div>
            </div>
            <div style="font-size:11px;color:#888;margin-top:6px">👍 ${fresh.confirmCount||0} · 👎 ${fresh.rejectCount||0}</div>
          ` : `<div style="font-size:12px;color:#aaa;margin-top:6px">אין דיווח עדכני</div>`}
        </div>
      `;

      circle.bindPopup(popupHtml);

      circle.on("click", () => {
        if (onSelectLot) onSelectLot(lot.name);
      });

      markersRef.current[lot.id] = circle;
    });
  }

  // Update markers when reports change
  useEffect(() => {
    if (mapInstanceRef.current && window.L) {
      renderMarkers(reports);
    }
  }, [reports]);

  const statusCounts = {
    available: PARKING_LOTS.filter((l) => getLotStatus(l.name, reports) === "available").length,
    partial:   PARKING_LOTS.filter((l) => getLotStatus(l.name, reports) === "partial").length,
    full:      PARKING_LOTS.filter((l) => getLotStatus(l.name, reports) === "full").length,
    unknown:   PARKING_LOTS.filter((l) => getLotStatus(l.name, reports) === "unknown").length,
  };

  return (
    <div className="map-container">
      <div className="map-legend">
        <span style={{ color: STATUS_COLORS.available }}>● פנוי ({statusCounts.available})</span>
        <span style={{ color: STATUS_COLORS.partial }}>● חלקי ({statusCounts.partial})</span>
        <span style={{ color: STATUS_COLORS.full }}>● מלא ({statusCounts.full})</span>
        <span style={{ color: STATUS_COLORS.unknown }}>● לא ידוע ({statusCounts.unknown})</span>
        {lastRefresh && (
          <span className="last-refresh">עודכן: {lastRefresh.toLocaleTimeString("he-IL")}</span>
        )}
      </div>
      <div ref={mapRef} className="leaflet-map" />
      <p className="map-hint">לחץ על עיגול כדי לבחור חניון לדיווח ולראות פרטים</p>
    </div>
  );
}
