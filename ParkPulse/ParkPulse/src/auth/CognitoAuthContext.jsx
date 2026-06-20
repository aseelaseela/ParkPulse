import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from "amazon-cognito-identity-js";

const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const AuthContext = createContext(null);

function createUserPool() {
  if (!USER_POOL_ID || !CLIENT_ID) {
    throw new Error(
      "Missing Cognito configuration. Check VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID in .env"
    );
  }

  return new CognitoUserPool({
    UserPoolId: USER_POOL_ID,
    ClientId: CLIENT_ID,
  });
}

function buildUserFromSession(session) {
  const idTokenPayload = session.getIdToken().payload || {};
  const groups = idTokenPayload["cognito:groups"] || [];
  const email = idTokenPayload.email || idTokenPayload["cognito:username"] || "";

  return {
    email,
    groups,
    idToken: session.getIdToken().getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
  };
}

export function CognitoAuthProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  const userPool = useMemo(() => createUserPool(), []);

  const refreshCurrentUser = () =>
    new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();

      if (!currentUser) {
        setUser(null);
        resolve(null);
        return;
      }

      currentUser.getSession((sessionError, session) => {
        if (sessionError || !session?.isValid()) {
          setUser(null);
          resolve(null);
          return;
        }

        const nextUser = buildUserFromSession(session);
        setUser(nextUser);
        resolve(nextUser);
      });
    });

  useEffect(() => {
    refreshCurrentUser()
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = (email, password) =>
    new Promise((resolve, reject) => {
      setError(null);

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
          const nextUser = buildUserFromSession(session);
          setUser(nextUser);
          resolve(nextUser);
        },
        onFailure: (authError) => {
          setError(authError);
          reject(authError);
        },
      });
    });

  const signUp = (email, password) =>
    new Promise((resolve, reject) => {
      setError(null);
      userPool.signUp(email, password, [], null, (signUpError, result) => {
        if (signUpError) {
          setError(signUpError);
          reject(signUpError);
          return;
        }

        resolve(result);
      });
    });

  const confirmSignUp = (email, code) =>
    new Promise((resolve, reject) => {
      setError(null);

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(code, true, (confirmError, result) => {
        if (confirmError) {
          setError(confirmError);
          reject(confirmError);
          return;
        }

        resolve(result);
      });
    });

  const resendConfirmationCode = (email) =>
    new Promise((resolve, reject) => {
      setError(null);

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.resendConfirmationCode((resendError, result) => {
        if (resendError) {
          setError(resendError);
          reject(resendError);
          return;
        }

        resolve(result);
      });
    });


  const forgotPassword = (email) =>
    new Promise((resolve, reject) => {
      setError(null);

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.forgotPassword({
        onSuccess: (data) => resolve(data),
        onFailure: (err) => {
          setError(err);
          reject(err);
        },
      });
    });

  const resetPassword = (email, code, newPassword) =>
    new Promise((resolve, reject) => {
      setError(null);

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => resolve(),
        onFailure: (err) => {
          setError(err);
          reject(err);
        },
      });
    });

  const signOut = () => {
    const currentUser = userPool.getCurrentUser();
    if (currentUser) currentUser.signOut();
    setUser(null);
  };

  const isAdmin = Boolean(
    user?.groups?.includes("Admin") ||
      (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()))
  );

  const value = {
    user,
    isAdmin,
    error,
    isLoading,
    isAuthenticated: Boolean(user),
    signIn,
    signUp,
    confirmSignUp,
    resendConfirmationCode,
    forgotPassword,
    resetPassword,
    signOut,
    refreshCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside CognitoAuthProvider");
  }
  return context;
}
