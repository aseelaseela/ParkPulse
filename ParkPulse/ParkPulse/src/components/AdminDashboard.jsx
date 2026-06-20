import { useEffect, useState, useMemo } from "react";
import {
  ADMIN_STATS_URL,
  ADMIN_REPORTS_URL,
  ADMIN_LOT_STATUS_URL,
  ADMIN_ALERTS_URL,
  PARKING_LOTS,
} from "../App";

function StatCard({ title, value, sub, color }) {
  return (
    <div
      className="stat-card"
      style={{ borderTop: `4px solid ${color || "#6366f1"}` }}
    >
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-title">{title}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

function HourlyBar({ hourly }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const maxVal = Math.max(1, ...Object.values(hourly || {}));

  return (
    <div className="hourly-chart">
      {hours.map((h) => {
        const count = hourly?.[h] || 0;
        const height = Math.max(2, Math.round((count / maxVal) * 80));
        const active = h >= 7 && h <= 19;

        return (
          <div
            key={h}
            className="hourly-bar-col"
            title={`${String(h).padStart(2, "0")}:00 — ${count} דיווחים`}
          >
            <div
              className="hourly-bar"
              style={{
                height: `${height}px`,
                background: active ? "#6366f1" : "#94a3b8",
              }}
            />
            {h % 3 === 0 && (
              <div className="hourly-label">
                {String(h).padStart(2, "0")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const statusLabel = {
  available: "פנוי ✅",
  partial: "חלקי 🟡",
  full: "מלא 🔴",
  unknown: "לא ידוע ❓",
};

const LOT_STATUS_OPTIONS = [
  { value: "available", label: "פנוי ✅" },
  { value: "partial", label: "חלקי 🟡" },
  { value: "full", label: "מלא 🔴" },
];

export default function AdminDashboard({ reports = [], onRefreshReports }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);

  const [deletingReportId, setDeletingReportId] = useState(null);
  const [reportsMessage, setReportsMessage] = useState(null);

  const [statusLot, setStatusLot] = useState(PARKING_LOTS[0]?.name || "");
  const [statusValue, setStatusValue] = useState("available");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState(false);
  const [deletingAlertId, setDeletingAlertId] = useState(null);
  const [clearingLot, setClearingLot] = useState(null);
  const [alertsMessage, setAlertsMessage] = useState(null);

  const byLotEntries = data
    ? Object.entries(data.byLot || {}).sort(
        (a, b) => (b[1].reports || 0) - (a[1].reports || 0)
      )
    : [];

  const uniqueAlertLots = useMemo(
    () => Array.from(new Set(alerts.map((a) => a.lotName).filter(Boolean))),
    [alerts]
  );

  async function fetchStats() {
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(ADMIN_STATS_URL);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
      setLastFetched(new Date());
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlerts() {
    setAlertsLoading(true);
    setAlertsError(false);

    try {
      const res = await fetch(ADMIN_ALERTS_URL);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      setAlerts(json.alerts || []);
    } catch (e) {
      console.error(e);
      setAlertsError(true);
    } finally {
      setAlertsLoading(false);
    }
  }

  async function handleDeleteReport(reportId, label) {
    if (!window.confirm(`למחוק את הדיווח "${label}"? הפעולה אינה הפיכה.`)) {
      return;
    }

    setDeletingReportId(reportId);
    setReportsMessage(null);

    try {
      const res = await fetch(
        `${ADMIN_REPORTS_URL}/${encodeURIComponent(reportId)}`,
        { method: "DELETE" }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setReportsMessage({
        type: "ok",
        text: "הדיווח נמחק בהצלחה",
      });

      onRefreshReports?.();
      fetchStats();
    } catch (e) {
      console.error(e);
      setReportsMessage({
        type: "error",
        text: "מחיקת הדיווח נכשלה",
      });
    } finally {
      setDeletingReportId(null);
    }
  }

  async function handleSetLotStatus(e) {
    e.preventDefault();

    if (!statusLot) {
      setStatusMessage({
        type: "error",
        text: "בחרי חניון קודם",
      });
      return;
    }

    setStatusBusy(true);
    setStatusMessage(null);

    try {
      const res = await fetch(ADMIN_LOT_STATUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotName: statusLot,
          status: statusValue,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const label = LOT_STATUS_OPTIONS.find(
        (option) => option.value === statusValue
      )?.label;

      setStatusMessage({
        type: "ok",
        text: `מצב החניון "${statusLot}" עודכן ל-${label}`,
      });

      onRefreshReports?.();
      fetchStats();
    } catch (e) {
      console.error(e);
      setStatusMessage({
        type: "error",
        text: "עדכון מצב החניון נכשל",
      });
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleClearLotStatus() {
    if (!statusLot) return;

    if (!window.confirm(`להסיר את העדכון הידני לחניון "${statusLot}"?`)) {
      return;
    }

    setStatusBusy(true);
    setStatusMessage(null);

    try {
      const res = await fetch(
        `${ADMIN_LOT_STATUS_URL}?lotName=${encodeURIComponent(statusLot)}`,
        { method: "DELETE" }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setStatusMessage({
        type: "ok",
        text: "העדכון הידני הוסר",
      });

      onRefreshReports?.();
      fetchStats();
    } catch (e) {
      console.error(e);
      setStatusMessage({
        type: "error",
        text: "הסרת העדכון נכשלה",
      });
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDeleteAlert(subscriptionId) {
    if (!window.confirm("למחוק את ההתראה הזו?")) return;

    setDeletingAlertId(subscriptionId);
    setAlertsMessage(null);

    try {
      const res = await fetch(
        `${ADMIN_ALERTS_URL}/${encodeURIComponent(subscriptionId)}`,
        { method: "DELETE" }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setAlerts((prev) =>
        prev.filter((alert) => alert.subscriptionId !== subscriptionId)
      );

      setAlertsMessage({
        type: "ok",
        text: "ההתראה נמחקה",
      });
    } catch (e) {
      console.error(e);
      setAlertsMessage({
        type: "error",
        text: "מחיקת ההתראה נכשלה",
      });
    } finally {
      setDeletingAlertId(null);
    }
  }

  async function handleClearLotAlerts(lotName) {
    if (!lotName) return;

    if (!window.confirm(`למחוק את כל ההתראות לחניון "${lotName}"?`)) {
      return;
    }

    setClearingLot(lotName);
    setAlertsMessage(null);

    try {
      const res = await fetch(
        `${ADMIN_ALERTS_URL}?lotName=${encodeURIComponent(lotName)}`,
        { method: "DELETE" }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setAlerts((prev) => prev.filter((alert) => alert.lotName !== lotName));

      setAlertsMessage({
        type: "ok",
        text: `נמחקו ${json.deletedCount ?? 0} התראות לחניון "${lotName}"`,
      });
    } catch (e) {
      console.error(e);
      setAlertsMessage({
        type: "error",
        text: "מחיקת ההתראות נכשלה",
      });
    } finally {
      setClearingLot(null);
    }
  }

  useEffect(() => {
    fetchStats();
    fetchAlerts();

    const iv = setInterval(fetchStats, 30000);
    return () => clearInterval(iv);
  }, []);

  if (loading && !data) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>טוען נתוני ניהול...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="error-screen">
        <p>שגיאה בטעינת נתוני הניהול</p>
        <button className="btn-primary" onClick={fetchStats}>
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="admin-dashboard" dir="rtl">
      <div className="admin-header-row">
        <h2 className="admin-title">📊 לוח בקרה — ניהול</h2>

        <div className="admin-meta">
          {lastFetched && (
            <span className="last-refresh">
              עודכן: {lastFetched.toLocaleTimeString("he-IL")}
            </span>
          )}

          <button className="btn-refresh" onClick={fetchStats} disabled={loading}>
            {loading ? "..." : "🔄 רענן"}
          </button>
        </div>
      </div>

      {/* Manual lot status override */}
      <h3 className="section-title">🛠️ עדכון ידני למצב חניון</h3>

      {statusMessage && (
        <div
          className={`admin-message ${
            statusMessage.type === "ok" ? "ok" : "error"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <form className="admin-form" onSubmit={handleSetLotStatus}>
        <select
          value={statusLot}
          onChange={(e) => setStatusLot(e.target.value)}
        >
          {PARKING_LOTS.map((lot) => (
            <option key={lot.id} value={lot.name}>
              {lot.name}
            </option>
          ))}
        </select>

        <select
          value={statusValue}
          onChange={(e) => setStatusValue(e.target.value)}
        >
          {LOT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button type="submit" className="btn-primary" disabled={statusBusy}>
          {statusBusy ? "..." : "עדכן מצב"}
        </button>

        <button
          type="button"
          className="btn-secondary"
          disabled={statusBusy}
          onClick={handleClearLotStatus}
        >
          הסר עדכון ידני
        </button>
      </form>

      {/* KPI cards */}
      <div className="admin-stats-row">
        <StatCard
          title="סה״כ דיווחים"
          value={data?.totalReports ?? "—"}
          color="#6366f1"
        />
        <StatCard
          title="אישורים"
          value={data?.totalConfirms ?? "—"}
          color="#22c55e"
        />
        <StatCard
          title="דחיות"
          value={data?.totalRejects ?? "—"}
          color="#ef4444"
        />
        <StatCard
          title="משתמשים"
          value={data?.totalUsers ?? "—"}
          color="#0ea5e9"
        />
      </div>

      {/* Reports management */}
      <h3 className="section-title">🗑️ ניהול דיווחים</h3>

      {reportsMessage && (
        <div
          className={`admin-message ${
            reportsMessage.type === "ok" ? "ok" : "error"
          }`}
        >
          {reportsMessage.text}
        </div>
      )}

      <div className="lot-table-wrap">
        <table className="lot-table">
          <thead>
            <tr>
              <th>חניון</th>
              <th>סטטוס</th>
              <th>👍</th>
              <th>👎</th>
              <th>נוצר</th>
              <th>מקור</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {reports.slice(0, 50).map((report) => (
              <tr key={report.reportId}>
                <td>{report.area || report.lotName || "—"}</td>
                <td>
                  {statusLabel[report.computedStatus] ||
                    report.availabilityLevel ||
                    "—"}
                </td>
                <td style={{ color: "#22c55e", fontWeight: 600 }}>
                  {report.confirmCount || 0}
                </td>
                <td style={{ color: "#ef4444", fontWeight: 600 }}>
                  {report.rejectCount || 0}
                </td>
                <td>
                  {report.createdAt
                    ? new Date(report.createdAt).toLocaleString("he-IL")
                    : "—"}
                </td>
                <td>{report.source || "user"}</td>
                <td>
                  <button
                    className="btn-danger"
                    disabled={deletingReportId === report.reportId}
                    onClick={() =>
                      handleDeleteReport(
                        report.reportId,
                        report.area || report.lotName || report.reportId
                      )
                    }
                  >
                    {deletingReportId === report.reportId ? "..." : "מחק"}
                  </button>
                </td>
              </tr>
            ))}

            {reports.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: "center",
                    color: "#94a3b8",
                    padding: "24px",
                  }}
                >
                  אין דיווחים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Alert subscriptions management */}
      <h3 className="section-title">🔔 ניהול התראות</h3>

      {alertsMessage && (
        <div
          className={`admin-message ${
            alertsMessage.type === "ok" ? "ok" : "error"
          }`}
        >
          {alertsMessage.text}
        </div>
      )}

      {alertsLoading && <p>טוען התראות...</p>}
      {alertsError && <p>שגיאה בטעינת ההתראות</p>}

      {!alertsLoading && !alertsError && (
        <div className="lot-table-wrap">
          <table className="lot-table">
            <thead>
              <tr>
                <th>אימייל</th>
                <th>חניון</th>
                <th>סטטוס</th>
                <th>נוצר</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.subscriptionId}>
                  <td>{alert.email || "—"}</td>
                  <td>{alert.lotName || "—"}</td>
                  <td>{alert.status || "—"}</td>
                  <td>
                    {alert.createdAt
                      ? new Date(alert.createdAt).toLocaleString("he-IL")
                      : "—"}
                  </td>
                  <td>
                    <button
                      className="btn-danger"
                      disabled={deletingAlertId === alert.subscriptionId}
                      onClick={() => handleDeleteAlert(alert.subscriptionId)}
                    >
                      {deletingAlertId === alert.subscriptionId ? "..." : "מחק"}
                    </button>
                  </td>
                </tr>
              ))}

              {alerts.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      color: "#94a3b8",
                      padding: "24px",
                    }}
                  >
                    אין מנויי התראות
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {uniqueAlertLots.length > 0 && (
        <div className="lot-chip-row">
          {uniqueAlertLots.map((lotName) => (
            <button
              key={lotName}
              className="btn-secondary"
              disabled={clearingLot === lotName}
              onClick={() => handleClearLotAlerts(lotName)}
            >
              {clearingLot === lotName ? "..." : `נקה התראות: ${lotName}`}
            </button>
          ))}
        </div>
      )}

      {/* Hourly chart */}
      {data?.hourly && (
        <>
          <h3 className="section-title">פעילות לפי שעה (24 שעות אחרונות)</h3>
          <HourlyBar hourly={data.hourly} />
        </>
      )}

      {/* Per-lot table */}
      <h3 className="section-title">מצב חניונים</h3>

      <div className="lot-table-wrap">
        <table className="lot-table">
          <thead>
            <tr>
              <th>חניון</th>
              <th>דיווחים</th>
              <th>👍</th>
              <th>👎</th>
              <th>יחס אישור</th>
            </tr>
          </thead>

          <tbody>
            {byLotEntries.map(([lotName, stats]) => {
              const confirms = stats.confirms || 0;
              const rejects = stats.rejects || 0;
              const total = confirms + rejects;
              const ratio =
                total > 0 ? Math.round((confirms / total) * 100) : null;

              return (
                <tr key={lotName}>
                  <td>{lotName}</td>
                  <td>{stats.reports}</td>
                  <td style={{ color: "#22c55e", fontWeight: 600 }}>
                    {confirms}
                  </td>
                  <td style={{ color: "#ef4444", fontWeight: 600 }}>
                    {rejects}
                  </td>
                  <td>
                    {ratio !== null ? (
                      <div className="mini-bar-wrap">
                        <div
                          className="mini-bar"
                          style={{
                            width: `${ratio}%`,
                            background:
                              ratio > 60
                                ? "#22c55e"
                                : ratio > 35
                                ? "#f59e0b"
                                : "#ef4444",
                          }}
                        />
                        <span>{ratio}%</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}

            {byLotEntries.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: "center",
                    color: "#94a3b8",
                    padding: "24px",
                  }}
                >
                  אין נתונים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Top reporters */}
      <h3 className="section-title">🏆 מדווחים מובילים</h3>

      <div className="top-reporters">
        {(data?.topReporters || []).length === 0 && <p>אין נתונים עדיין</p>}

        {(data?.topReporters || []).map((user, i) => (
          <div key={user.email} className="reporter-row">
            <span className="reporter-rank">#{i + 1}</span>
            <span className="reporter-email">{user.email}</span>
            <span className="reporter-count">
              {user.totalReports} דיווחים
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
