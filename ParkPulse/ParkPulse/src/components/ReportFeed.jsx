import { computeReliability, STATUS_COLORS } from "../App";

function ReliabilityBar({ score }) {
  const color =
    score > 60
      ? STATUS_COLORS.available
      : score > 35
        ? STATUS_COLORS.partial
        : STATUS_COLORS.full;

  return (
    <div className="reliability-wrap">
      <div className="reliability-label">אמינות</div>
      <div className="reliability-track">
        <div
          className="reliability-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <div className="reliability-pct" style={{ color }}>
        {score}%
      </div>
    </div>
  );
}

function ReportCard({ report, onFeedback }) {
  const reliability = computeReliability(report);
  const ageMin = Math.round(
    (Date.now() - new Date(report.createdAt).getTime()) / 60000
  );

  const isStale = ageMin > 30;
  const isFull = (report.rejectCount || 0) >= 3;

  return (
    <div className={`report-card ${isStale ? "stale" : ""}`}>
      <div className="report-header">
        <h3 className="report-area">{report.area}</h3>

        <span
          className={`availability-badge ${
            report.availabilityLevel === "הרבה חניה פנויה"
              ? "avail-high"
              : "avail-low"
          }`}
        >
          {report.availabilityLevel || "לא צוין"}
        </span>
      </div>

      {isFull && (
        <div className="warning-banner">
          ⚠️ מספר משתמשים ציינו שאין כבר חניה
        </div>
      )}

      <ReliabilityBar score={reliability} />

      <div className="report-meta">
        <span>👤 {report.userEmail?.split("@")[0]}</span>
        <span>{report.reporterBadge || "🆕 חדש"}</span>
        <span>⭐ מוניטין: {report.reporterReputationScore || 0}</span>
        <span>🕐 לפני {ageMin} דקות</span>
        {isStale && <span className="stale-badge">ישן</span>}
      </div>

      <div className="feedback-row">
        <button
          className="btn-confirm"
          onClick={() => onFeedback(report.reportId, "confirm")}
        >
          👍 עדיין פנוי
          <span className="vote-count">{report.confirmCount || 0}</span>
        </button>

        <button
          className="btn-reject"
          onClick={() => onFeedback(report.reportId, "reject")}
        >
          👎 לא פנוי
          <span className="vote-count">{report.rejectCount || 0}</span>
        </button>
      </div>
    </div>
  );
}

export default function ReportFeed({ reports, onFeedback }) {
  if (reports.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🅿️</div>
        <p>אין דיווחים עדיין. היה הראשון לדווח!</p>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <div className="feed-header">
        <h2>📋 דיווחים אחרונים</h2>
        <span className="feed-count">{reports.length} דיווחים</span>
      </div>

      <div className="feed-list">
        {reports.map((report) => (
          <ReportCard
            key={report.reportId}
            report={report}
            onFeedback={onFeedback}
          />
        ))}
      </div>
    </div>
  );
}
