import { useState } from "react";
import "./Welcome.css";

export default function Welcome({ user }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/onboarding/complete", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Unable to continue. Please try again.");
      }

      window.location.replace("/");
    } catch (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Unable to sign out.");
      }

      window.location.replace("/signin");
    } catch (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <span className="welcome-brand">k ᐧ ai</span>

        <button type="button" onClick={signOut} disabled={busy}>
          Sign out
        </button>
      </header>

      <section className="welcome-content">
        <img src="/kailor-head.png" alt="" />

        <h1>Welcome to kai.</h1>

        <p>You're signed in as {user.name}.</p>

        {user.role === "admin" && <p>Editorial administrator</p>}

        {error && <p role="alert">{error}</p>}

        <div className="welcome-actions">
          <button type="button" onClick={handleContinue} disabled={busy}>
            {busy ? "Continuing..." : "Continue"}
          </button>
        </div>
      </section>
    </main>
  );
}
