import { useEffect, useState } from "react";
import { PARKING_LOTS, SUBSCRIBE_ALERT_URL } from "../App";

export default function AlertSubscription({ userEmail }) {
  const [email, setEmail] = useState(userEmail || "");
  const [lotName, setLotName] = useState(PARKING_LOTS[0]?.name || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (userEmail && !email) {
      setEmail(userEmail);
    }
  }, [userEmail, email]);

  async function handleSubscribe(e) {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({
        type: "error",
        text: "יש להזין אימייל",
      });
      return;
    }

    if (!lotName) {
      setMessage({
        type: "error",
        text: "יש לבחור חניון",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(SUBSCRIBE_ALERT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          lotName,
          action: "subscribe",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setMessage({
        type: "ok",
        text: "נרשמת להתראות. בדקי את המייל ולחצי Confirm subscription כדי להפעיל את ההתראות.",
      });
    } catch (err) {
      console.error("Subscribe alert failed:", err);

      setMessage({
        type: "error",
        text: "ההרשמה להתראה נכשלה. נסי שוב.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsubscribe() {
    if (!email.trim()) {
      setMessage({
        type: "error",
        text: "יש להזין אימייל",
      });
      return;
    }

    if (!lotName) {
      setMessage({
        type: "error",
        text: "יש לבחור חניון",
      });
      return;
    }

    if (!window.confirm(`להסיר הרשמה להתראות עבור "${lotName}"?`)) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(SUBSCRIBE_ALERT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          lotName,
          action: "unsubscribe",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setMessage({
        type: "ok",
        text: "ההרשמה להתראה הוסרה בהצלחה.",
      });
    } catch (err) {
      console.error("Unsubscribe alert failed:", err);

      setMessage({
        type: "error",
        text: "הסרת ההרשמה נכשלה. נסי שוב.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel-card alert-subscription" dir="rtl">
      <h2>🔔 התראות זמינות חניה</h2>

      <p className="muted-text">
        קבלי מייל כאשר חניון שבחרת הופך לזמין.
      </p>

      {message && (
        <div
          className={`admin-message ${
            message.type === "ok" ? "ok" : "error"
          }`}
        >
          {message.text}
        </div>
      )}

      <form className="admin-form" onSubmit={handleSubscribe}>
        <label>
          אימייל
          <input
            type="email"
            value={email}
            placeholder="name@example.com"
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </label>

        <label>
          בחר חניון
          <select
            value={lotName}
            onChange={(e) => setLotName(e.target.value)}
            disabled={loading}
          >
            {PARKING_LOTS.map((lot) => (
              <option key={lot.id} value={lot.name}>
                {lot.name}
              </option>
            ))}
          </select>
        </label>

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "נרשם..." : "הירשם להתראה"}
        </button>

        <button
          className="btn-secondary"
          type="button"
          onClick={handleUnsubscribe}
          disabled={loading}
        >
          הסר הרשמה
        </button>
      </form>
    </div>
  );
}