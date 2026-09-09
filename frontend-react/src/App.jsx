import { useEffect, useMemo, useState } from "react";
import {
  authConfigured,
  beginSignIn,
  completeAuthRedirect,
  loadStoredAuth,
  signOut
} from "./auth";
import { getAppConfig } from "./config";
import TasksPanel from "./components/TasksPanel";
import WeatherPanel from "./components/WeatherPanel";
import SubscriptionsPanel from './components/SubscriptionsPanel';
import AgentChat from "./components/AgentChat";

function formatDashboardDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function App() {
  const config = useMemo(() => getAppConfig(), []);
  const isAuthConfigured = authConfigured(config);
  const [auth, setAuth] = useState(() => loadStoredAuth());
  const [authError, setAuthError] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem("todoApp_theme");
      return stored === "dark" || stored === "light" ? stored : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        const result = await completeAuthRedirect(config);
        if (cancelled) return;
        if (result.error) {
          setAuthError(result.error);
          setAuth(null);
        } else if (result.auth) {
          setAuth(result.auth);
          setAuthError("");
        } else {
          setAuth(loadStoredAuth());
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(err.message || "Could not complete sign-in.");
          setAuth(null);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    initAuth();
    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("todoApp_theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    function updatePointer(event) {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--mouse-x", `${event.clientX}px`);
        root.style.setProperty("--mouse-y", `${event.clientY}px`);
      });
    }

    window.addEventListener("pointermove", updatePointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", updatePointer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const userLabel =
    auth?.claims?.email || auth?.claims?.["cognito:username"] || (auth ? "Signed in" : "Signed out");

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-header-text">
          <h1 className="dashboard-title">SubLens</h1>
          <p className="dashboard-date">{formatDashboardDate()}</p>
        </div>
        <div className="header-actions">
          <div className="auth-status" role="status">
            <span className="auth-user">
              {!isAuthConfigured ? "Auth not configured" : userLabel}
            </span>
            {auth ? (
              <button
                type="button"
                className="btn-secondary auth-btn"
                onClick={() => signOut(config)}
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary auth-btn"
                disabled={!isAuthConfigured || !authReady}
                onClick={() => beginSignIn(config).catch(err => setAuthError(err.message))}
              >
                Sign in
              </button>
            )}
          </div>
          <button
            type="button"
            className="theme-toggle"
            aria-label="Toggle theme"
            onClick={() => setTheme(current => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      {!auth ? (
        <section className="auth-panel card" aria-labelledby="authPanelTitle">
        <p className="auth-eyebrow">Personal AWS Dashboard</p>
        <h2 className="auth-title" id="authPanelTitle">
          Sign in to your toolkit
        </h2>
        <p className="auth-copy">
          Access your private subscriptions, tasks, and weather from a
          Cognito-protected React dashboard backed by Express, TypeScript, Docker,
          Amazon EC2, and DynamoDB.
        </p>
        <ul className="auth-feature-list" aria-label="Application highlights">
          <li>Private tasks isolated per account</li>
          <li>JWT-secured API access</li>
          <li>Containerized AWS deployment</li>
        </ul>
        {authError ? (
          <p className="auth-error" role="alert">
            {authError}
          </p>
        ) : null}
        {!isAuthConfigured ? (
          <p className="auth-error" role="alert">
            Cognito is not configured. Fill public/config.js with Cognito domain and client ID.
          </p>
        ) : null}
        <button
          type="button"
          className="btn-secondary auth-primary-btn"
          disabled={!isAuthConfigured || !authReady}
          onClick={() => beginSignIn(config).catch(err => setAuthError(err.message))}
        >
          Sign in securely
        </button>
      </section>
      ) : (
        <>
          <div className="dashboard-content">
            <main className="dashboard-main" aria-label="Subscription workspace">
              <SubscriptionsPanel auth={auth} setAuth={setAuth} onAuthExpired={setAuthError} />
            </main>
            <aside className="dashboard-sidebar" aria-label="Productivity tools">
              <WeatherPanel />
              <TasksPanel auth={auth} setAuth={setAuth} onAuthExpired={setAuthError} />
            </aside>
          </div>
          <AgentChat auth={auth} setAuth={setAuth} onAuthExpired={setAuthError} />
        </>
      )}
    </div>
  );
}

export default App;
