import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "./auth/CognitoAuthContext";
import AuthScreen from "./components/AuthScreen";
import ParkingMap from "./components/ParkingMap";
import ReportPanel from "./components/ReportPanel";
import ReportFeed from "./components/ReportFeed";
import AdminDashboard from "./components/AdminDashboard";
import AlertSubscription from "./components/AlertSubscription";
import "./App.css";

export const API_BASE = import.meta.env.VITE_API_BASE;

export const REPORTS_API_URL = `${API_BASE}/reports`;
export const FEEDBACK_API_URL = `${API_BASE}/feedback`;
export const USER_STATS_API_URL = `${API_BASE}/user-stats`;
export const ADMIN_STATS_URL = `${API_BASE}/admin/stats`;
export const ADMIN_REPORTS_URL = `${API_BASE}/admin/reports`;
export const ADMIN_LOT_STATUS_URL = `${API_BASE}/admin/lot-status`;
export const ADMIN_ALERTS_URL = `${API_BASE}/admin/alerts`;
export const SUBSCRIBE_ALERT_URL = `${API_BASE}/subscribe`;

export const PARKING_LOTS = [
  { id: "ברוש-א", name: "חניון ברוש א", lat: 32.10565, lng: 35.21020 },
  { id: "ברוש-ב", name: "חניון ברוש ב", lat: 32.10625, lng: 35.20940 },
  { id: "ברוש-ג", name: "חניון ברוש ג", lat: 32.10480, lng: 35.20900 },
  { id: "חרוב", name: "חניון חרוב", lat: 32.10490, lng: 35.20979 },
  { id: "דובדבן", name: "חניון דובדבן", lat: 32.10635, lng: 35.21135 },
  { id: "רימון", name: "חניון רימון", lat: 32.10555, lng: 35.21245 },
  { id: "tamar1", name: "חניון תמר 1", lat: 32.10430, lng: 35.21275 },
  { id: "tamar2", name: "חניון תמר 2", lat: 32.10435, lng: 35.21385 },
  { id: "שיטה", name: "חניון שיטה", lat: 32.10295, lng: 35.21160 },
  { id: "אלון", name: "חניון אלון", lat: 32.10680, lng: 35.20550 },
  { id: "סגל", name: "חניון סגל", lat: 32.10468, lng: 35.20850 },
  { id: "20", name: "חניון 20", lat: 32.10590, lng: 35.21135 },
  { id: "21", name: "חניון 21", lat: 32.10535, lng: 35.21145 },
  { id: "מגורים", name: "חניון דיירי מגורים", lat: 32.10370, lng: 35.20390 },
];

export function computeReliability(report) {
  if (!report) return 50;

  const confirms = report.confirmCount || 0;
  const rejects = report.rejectCount || 0;
  const total = confirms + rejects;

  if (total === 0) return 50;

  return Math.round((confirms / total) * 100);
}

export function getLotStatus(lotName, reports) {
  if (!reports || reports.length === 0) return "unknown";

  const now = Date.now();

  const fresh = reports.filter(
    (r) =>
      r.area === lotName &&
      now - new Date(r.createdAt).getTime() < 30 * 60 * 1000
  );

  if (fresh.length === 0) return "unknown";

  const latest = fresh[0];

  const rejectRatio =
    (latest.rejectCount || 0) /
    Math.max(1, (latest.confirmCount || 0) + (latest.rejectCount || 0));

  if (rejectRatio >= 0.6) return "full";
  if (latest.availabilityLevel === "הרבה חניה פנויה") return "available";

  return "partial";
}

export const STATUS_COLORS = {
  available: "#22c55e",
  partial: "#f59e0b",
  full: "#ef4444",
  unknown: "#94a3b8",
};

const REFRESH_INTERVAL = 25000;

function App() {
  const auth = useAuth();

  const [reports, setReports] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [activeTab, setActiveTab] = useState("map");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshCountdown, setRefreshCountdown] = useState(
    REFRESH_INTERVAL / 1000
  );
  const [apiError, setApiError] = useState(false);
  const [selectedLotFromMap, setSelectedLotFromMap] = useState("");

  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch(REPORTS_API_URL);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      const sorted = Array.isArray(data)
        ? [...data].sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          )
        : [];

      setReports(sorted);
      setLastRefresh(new Date());
      setApiError(false);
      setRefreshCountdown(Math.round(REFRESH_INTERVAL / 1000));
    } catch (e) {
      console.error("Failed to load reports", e);
      setApiError(true);
    }
  }, []);

  const loadUserStats = useCallback(async () => {
    const email = auth.user?.email;

    if (!email) return;

    try {
      const res = await fetch(
        `${USER_STATS_API_URL}?email=${encodeURIComponent(email)}`
      );

      if (!res.ok) return;

      const data = await res.json();
      setUserStats(data);
    } catch (e) {
      console.error("Failed to load user stats", e);
    }
  }, [auth.user]);

  const sendFeedback = async (reportId, action) => {
    try {
      const res = await fetch(FEEDBACK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId,
          action,
          voterEmail: auth.user?.email,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "לא ניתן לשלוח פידבק");
        return;
      }

      loadReports();
      loadUserStats();
    } catch (e) {
      console.error("Failed to send feedback", e);
      alert("שגיאת חיבור בשליחת פידבק");
    }
  };

  const handleSelectLotFromMap = (lotName) => {
    setSelectedLotFromMap(lotName);
    setActiveTab("report");
  };

  const addReport = async (area, availabilityLevel) => {
    try {
      const res = await fetch(REPORTS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          area,
          availabilityLevel,
          userEmail: auth.user?.email,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "לא ניתן לשלוח דיווח");
      }

      loadReports();
      loadUserStats();

      return { ok: true };
    } catch (e) {
      console.error("Failed to add report", e);

      return {
        ok: false,
        error: e.message || "לא ניתן לשלוח דיווח",
      };
    }
  };

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    loadReports();
    loadUserStats();

    intervalRef.current = setInterval(loadReports, REFRESH_INTERVAL);

    countdownRef.current = setInterval(() => {
      setRefreshCountdown((c) =>
        c <= 1 ? Math.round(REFRESH_INTERVAL / 1000) : c - 1
      );
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    };
  }, [auth.isAuthenticated, loadReports, loadUserStats]);

  if (auth.isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>טוען...</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <AuthScreen />;
  }

  const tabs = ["map", "feed", "report", "alerts", ...(auth.isAdmin ? ["admin"] : [])];

  const tabLabels = {
    map: "🗺️ מפה",
    feed: "📋 דיווחים",
    report: "➕ דווח",
    alerts: "🔔 התראות",
    admin: "📊 ניהול",
  };

  return (
    <div className="app" dir="rtl">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-icon">🅿️</span>
          <h1>חניות אריאל</h1>
        </div>

        <nav className="header-nav">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`nav-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </nav>

        <div className="header-user">
          {apiError && <span className="error-badge">⚠️ שגיאת חיבור</span>}

          <span className="refresh-badge">🔄 {refreshCountdown}ש׳</span>

          <button className="btn-logout" onClick={auth.signOut}>
            יציאה
          </button>
        </div>
      </header>

      <main className="app-main">
        {activeTab === "map" && (
          <ParkingMap
            reports={reports}
            lastRefresh={lastRefresh}
            onSelectLot={handleSelectLotFromMap}
          />
        )}

        {activeTab === "feed" && (
          <ReportFeed reports={reports} onFeedback={sendFeedback} />
        )}

        {activeTab === "report" && (
          <ReportPanel
            userStats={userStats}
            onSubmit={addReport}
            userEmail={auth.user?.email}
            selectedLotFromMap={selectedLotFromMap}
            onClearSelectedLot={() => setSelectedLotFromMap("")}
          />
        )}

        {activeTab === "alerts" && (
          <AlertSubscription userEmail={auth.user?.email} />
        )}

        {activeTab === "admin" && auth.isAdmin && (
          <AdminDashboard
            reports={reports}
            onRefreshReports={loadReports}
          />
        )}
      </main>
    </div>
  );
}

export default App;