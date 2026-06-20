import { useEffect, useState } from "react";
import { PARKING_LOTS } from "../App";

export default function ReportPanel({
  userStats,
  onSubmit,
  userEmail,
  selectedLotFromMap,
  onClearSelectedLot
}) {

  const [selectedLot, setSelectedLot] = useState(selectedLotFromMap || "");
  const [availabilityLevel, setAvailabilityLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedLotFromMap) {
      setSelectedLot(selectedLotFromMap);
    }
  }, [selectedLotFromMap]);


  const handleSubmit = async () => {
    if (!selectedLot || !availabilityLevel) return;

    setSubmitting(true);
    setError("");

    const result =
      await onSubmit(selectedLot, availabilityLevel);

    setSubmitting(false);

    if (result && result.ok === false) {
      setError(result.error);
      return;
    }

    setSubmitted(true);

    setSelectedLot("");
    setAvailabilityLevel("");

    if (onClearSelectedLot) {
      onClearSelectedLot();
    }

    setTimeout(() => {
      setSubmitted(false);
    }, 3000);
  };


  return (
    <div className="report-panel">

      {userStats && (

        <div className="user-stats-card">

          <h3>📊 הסטטיסטיקות שלי</h3>


          <div className="stats-grid">


            <div className="stat-item">
              <div className="stat-value">
                {userStats.totalReports || 0}
              </div>
              <div className="stat-label">
                דיווחים
              </div>
            </div>


            <div className="stat-item">
              <div className="stat-value">
                {userStats.totalConfirms || 0}
              </div>
              <div className="stat-label">
                אישורים
              </div>
            </div>


            <div className="stat-item">
              <div className="stat-value">
                {userStats.totalRejects || 0}
              </div>
              <div className="stat-label">
                דחיות
              </div>
            </div>


            <div className="stat-item">
              <div className="stat-value">
                {userStats.reputationScore || 0}
              </div>
              <div className="stat-label">
                ⭐ מוניטין
              </div>
            </div>


            <div className="stat-item">
              <div className="stat-value">
                {userStats.badge || "🆕 חדש"}
              </div>
              <div className="stat-label">
                דרגה
              </div>
            </div>


          </div>


          <p className="stats-help">
            ⭐ המוניטין נקבע לפי דיווחים,
            אישורים שקיבלת ודחיות
          </p>


          <p className="user-email">
            מחובר כ: {userEmail}
          </p>


        </div>

      )}


      <div className="report-form-card">

        <h2>➕ דווח על חניה</h2>

        <p className="form-hint">
          עזור לאחרים למצוא חניה!
        </p>


        {selectedLotFromMap && (
          <div className="selected-from-map">
            🗺️ נבחר מהמפה:
            <strong> {selectedLotFromMap}</strong>
          </div>
        )}


        <label className="form-label">
          בחר חניון
        </label>


        <select
          value={selectedLot}
          onChange={(e) =>
            setSelectedLot(e.target.value)
          }
          className="form-select"
        >

          <option value="">
            -- בחר חניון --
          </option>


          {PARKING_LOTS.map((lot) => (

            <option
              key={lot.id}
              value={lot.name}
            >
              {lot.name}
            </option>

          ))}

        </select>


        <label
          className="form-label"
          style={{ marginTop: "18px" }}
        >
          מצב זמינות
        </label>


        <div className="avail-options">


          <button
            className={
              `avail-option ${
              availabilityLevel === "הרבה חניה פנויה"
              ? "selected-high"
              : ""
              }`
            }
            onClick={() =>
              setAvailabilityLevel("הרבה חניה פנויה")
            }
          >
            🟢 הרבה חניה פנויה
          </button>


          <button
            className={
              `avail-option ${
              availabilityLevel === "קצת חניה פנויה"
              ? "selected-low"
              : ""
              }`
            }
            onClick={() =>
              setAvailabilityLevel("קצת חניה פנויה")
            }
          >
            🟡 קצת חניה פנויה
          </button>


        </div>


        {error && (
          <div className="error-banner">
            ⚠️ {error}
          </div>
        )}


        {submitted ? (

          <div className="success-banner">
            ✅ הדיווח נשלח בהצלחה! תודה!
          </div>

        ) : (

          <button
            className="btn-submit"
            onClick={handleSubmit}
            disabled={
              !selectedLot ||
              !availabilityLevel ||
              submitting
            }
          >

            {submitting
              ? "שולח..."
              : "📤 שלח דיווח"}

          </button>

        )}

      </div>

    </div>
  );
}
