import { useState } from "react";
import { useAuth } from "../auth/CognitoAuthContext";

function friendlyError(error) {
  const message = error?.message || String(error || "");

  if (message.includes("User does not exist")) return "המשתמש לא קיים. בדוק את האימייל או הירשם.";
  if (message.includes("Incorrect username or password")) return "אימייל או סיסמה שגויים.";
  if (message.includes("User is not confirmed")) return "צריך לאמת את החשבון עם הקוד שנשלח למייל.";
  if (message.includes("Password did not conform")) return "הסיסמה לא עומדת בדרישות. נסה לפחות 8 תווים.";
  if (message.includes("Invalid verification code")) return "קוד האימות שגוי.";
  if (message.includes("UsernameExistsException")) return "משתמש עם האימייל הזה כבר קיים.";
  if (message.includes("CodeMismatchException")) return "קוד האימות שגוי.";
  if (message.includes("ExpiredCodeException")) return "קוד האימות פג תוקף. בקש קוד חדש.";

  return message || "אירעה שגיאה. נסה שוב.";
}

export default function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const cleanEmail = email.trim().toLowerCase();

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await auth.signIn(cleanEmail, password);
    } catch (err) {
      if (err?.code === "UserNotConfirmedException") {
        setMode("confirm");
        setMessage("החשבון קיים אבל עדיין לא אומת. הכנס את קוד האימות מהמייל.");
      }
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await auth.signUp(cleanEmail, password);
      if (result?.userConfirmed) {
        setMessage("ההרשמה הצליחה. אפשר להתחבר עכשיו.");
        setMode("login");
      } else {
        setMessage("נשלח אליך קוד אימות למייל. הכנס אותו כאן כדי להשלים הרשמה.");
        setMode("confirm");
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await auth.confirmSignUp(cleanEmail, code.trim());
      setMessage("האימות הצליח. עכשיו אפשר להתחבר.");
      setMode("login");
      setCode("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }


  async function handleForgotPassword() {
    if (!cleanEmail) {
      setError("הכנס אימייל כדי לשלוח קוד איפוס סיסמה.");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      await auth.forgotPassword(cleanEmail);
      setMessage("נשלח אליך קוד איפוס סיסמה למייל.");
      setMode("reset");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await auth.resetPassword(cleanEmail, code.trim(), newPassword);
      setMessage("הסיסמה אופסה בהצלחה. עכשיו אפשר להתחבר.");
      setMode("login");
      setCode("");
      setNewPassword("");
      setPassword("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (!cleanEmail) {
      setError("הכנס אימייל כדי לשלוח קוד מחדש.");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      await auth.resendConfirmationCode(cleanEmail);
      setMessage("קוד אימות חדש נשלח למייל.");
      setMode("confirm");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  const isConfirmMode = mode === "confirm";
  const isResetMode = mode === "reset";
  const isRegisterMode = mode === "register";

  return (
    <div className="login-screen" dir="rtl">
      <div className="login-card auth-card">
        <div className="login-icon">🚗</div>
        <h1>חניות פנויות באריאל</h1>
        <p>
          מערכת חכמה לשיתוף ודיווח בזמן אמת על מקומות חניה פנויים בקמפוס אריאל
        </p>

        <div className="auth-info">
          <p>• דיווח על חניה שהתפנתה</p>
          <p>• אישור ודחיית דיווחים של משתמשים</p>
          <p>• צפייה במפת עומסי חניה</p>
          <p>• מערכת אמינות ודירוג מדווחים</p>
        </div>

        <p className="project-credit">
          Cloud Application Development - Ariel University
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            התחברות
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            הרשמה
          </button>
        </div>

        <form onSubmit={isResetMode ? handleResetPassword : isConfirmMode ? handleConfirm : isRegisterMode ? handleRegister : handleLogin}>
          <label className="auth-label">אימייל</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            required
          />

          {!isConfirmMode && !isResetMode && (
            <>
              <label className="auth-label">סיסמה</label>
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="לפחות 8 תווים"
                autoComplete={isRegisterMode ? "new-password" : "current-password"}
                required
              />
            </>
          )}

          {isConfirmMode && (
            <>
              <label className="auth-label">קוד אימות מהמייל</label>
              <input
                className="auth-input"
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                required
              />
            </>
          )}

          {isResetMode && (
            <>
              <label className="auth-label">קוד איפוס מהמייל</label>
              <input
                className="auth-input"
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                required
              />

              <label className="auth-label">סיסמה חדשה</label>
              <input
                className="auth-input"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="לפחות 8 תווים"
                autoComplete="new-password"
                required
              />
            </>
          )}

          {message && <div className="auth-message success">{message}</div>}
          {error && <div className="auth-message error">{error}</div>}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading
              ? "ממתין..."
              : isConfirmMode
                ? "אמת חשבון"
                : isResetMode
                  ? "אפס סיסמה"
                  : isRegisterMode
                    ? "הרשמה"
                    : "התחברות"}
          </button>
        </form>

          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "15px",
          alignItems: "center"
        }}>

          {mode === "login" && (
            <button className="auth-link" type="button" onClick={handleForgotPassword} disabled={loading}>
              שכחתי סיסמה
            </button>
          )}

          <button className="auth-link" type="button" onClick={handleResendCode} disabled={loading}>
            שלח קוד אימות מחדש
          </button>

        </div>
      </div>
    </div>
  );
}
