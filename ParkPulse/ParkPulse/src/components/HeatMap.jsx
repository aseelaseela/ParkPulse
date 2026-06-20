import { useMemo, useState } from "react";
import { PARKING_LOTS, STATUS_COLORS } from "../App";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_LABELS = HOURS.map((h) => `${String(h).padStart(2, "0")}:00`);

// Build a density map: lotName → hour → report count
function buildDensityMap(reports) {
  const map = {};
  PARKING_LOTS.forEach((lot) => {
    map[lot.name] = Array(24).fill(0);
  });
  reports.forEach((r) => {
    const h = new Date(r.createdAt).getHours();
    if (map[r.area] !== undefined) {
      map[r.area][h]++;
    }
  });
  return map;
}

// Latest availability per lot per hour (for color encoding)
function buildAvailabilityMap(reports) {
  const map = {};
  PARKING_LOTS.forEach((lot) => {
    map[lot.name] = Array(24).fill(null);
  });
  // Process from oldest to newest so latest wins
  const sorted = [...reports].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  sorted.forEach((r) => {
    const h = new Date(r.createdAt).getHours();
    if (map[r.area] !== undefined) {
      const rejectRatio =
        (r.rejectCount || 0) / Math.max(1, (r.confirmCount || 0) + (r.rejectCount || 0));
      if (rejectRatio >= 0.6) map[r.area][h] = "full";
      else if (r.availabilityLevel === "הרבה חניה פנויה") map[r.area][h] = "available";
      else map[r.area][h] = "partial";
    }
  });
  return map;
}

function statusToColor(status, alpha = 0.8) {
  const hex = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Show only the 12 hours with most activity for clarity
const VISIBLE_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

export default function HeatMap({ reports }) {
  const [tooltip, setTooltip] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);

  const densityMap    = useMemo(() => buildDensityMap(reports), [reports]);
  const availMap      = useMemo(() => buildAvailabilityMap(reports), [reports]);
  const maxCount      = useMemo(() => {
    let m = 1;
    PARKING_LOTS.forEach((lot) => {
      VISIBLE_HOURS.forEach((h) => {
        m = Math.max(m, densityMap[lot.name][h]);
      });
    });
    return m;
  }, [densityMap]);

  // Summary: lots with most/least reports in selected hour
  const hourSummary = useMemo(() => {
    if (selectedHour === null) return null;
    return PARKING_LOTS.map((lot) => ({
      lot,
      count:  densityMap[lot.name][selectedHour],
      status: availMap[lot.name][selectedHour],
    })).sort((a, b) => b.count - a.count);
  }, [selectedHour, densityMap, availMap]);

  const totalReports = reports.length;

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <h2>🌡️ מפת חום — צפיפות דיווחים לפי שעה</h2>
        <p className="heatmap-hint">
          לחץ על שעה לפירוט · {totalReports} דיווחים סה״כ
        </p>
      </div>

      {totalReports === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>אין מספיק נתונים להצגת מפת החום. אחרי כמה דיווחים המפה תתמלא.</p>
        </div>
      ) : (
        <>
          {/* Heatmap grid */}
          <div className="heatmap-scroll">
            <div className="heatmap-grid" style={{ "--col-count": VISIBLE_HOURS.length }}>
              {/* Header row: hour labels */}
              <div className="heatmap-corner" />
              {VISIBLE_HOURS.map((h) => (
                <button
                  key={h}
                  className={`heatmap-hour-label ${selectedHour === h ? "selected" : ""}`}
                  onClick={() => setSelectedHour(selectedHour === h ? null : h)}
                >
                  {String(h).padStart(2, "0")}
                </button>
              ))}

              {/* Lot rows */}
              {PARKING_LOTS.map((lot) => (
                <>
                  <div key={`label-${lot.id}`} className="heatmap-lot-label">
                    {lot.name}
                  </div>
                  {VISIBLE_HOURS.map((h) => {
                    const count  = densityMap[lot.name][h];
                    const status = availMap[lot.name][h];
                    const intensity = count / maxCount;
                    const bg = status
                      ? statusToColor(status, 0.2 + intensity * 0.7)
                      : `rgba(148,163,184,${0.08 + intensity * 0.35})`;

                    return (
                      <div
                        key={`${lot.id}-${h}`}
                        className={`heatmap-cell ${count > 0 ? "has-data" : ""} ${selectedHour === h ? "col-selected" : ""}`}
                        style={{ background: bg }}
                        onMouseEnter={() =>
                          setTooltip({ lot: lot.name, hour: h, count, status })
                        }
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {count > 0 && (
                          <span className="cell-count">{count}</span>
                        )}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div className="heatmap-tooltip">
              <strong>{tooltip.lot}</strong> — {String(tooltip.hour).padStart(2, "0")}:00
              <br />
              {tooltip.count} דיווחים
              {tooltip.status && (
                <span
                  className="tooltip-status"
                  style={{ color: STATUS_COLORS[tooltip.status] }}
                >
                  {" · "}
                  {{ available: "פנוי", partial: "חלקי", full: "מלא" }[tooltip.status]}
                </span>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="heatmap-legend">
            <span>פחות פעיל</span>
            <div className="legend-gradient" />
            <span>יותר פעיל</span>
            <div className="legend-status">
              {Object.entries({ available: "פנוי", partial: "חלקי", full: "מלא", unknown: "לא ידוע" }).map(
                ([k, label]) => (
                  <span key={k} className="legend-dot" style={{ color: STATUS_COLORS[k] }}>
                    ● {label}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Hour-click detail panel */}
          {selectedHour !== null && hourSummary && (
            <div className="hour-detail-panel">
              <h3>
                פירוט שעה {String(selectedHour).padStart(2, "0")}:00
                <button className="close-btn" onClick={() => setSelectedHour(null)}>✕</button>
              </h3>
              <div className="hour-lot-list">
                {hourSummary.map(({ lot, count, status }) => (
                  <div key={lot.id} className="hour-lot-row">
                    <span className="hlr-name">{lot.name}</span>
                    <span className="hlr-count">{count} דיווחים</span>
                    {status && (
                      <span
                        className="hlr-status"
                        style={{
                          background: STATUS_COLORS[status] + "22",
                          color: STATUS_COLORS[status],
                          border: `1px solid ${STATUS_COLORS[status]}`,
                        }}
                      >
                        {{ available: "פנוי ✅", partial: "חלקי 🟡", full: "מלא 🔴" }[status]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
