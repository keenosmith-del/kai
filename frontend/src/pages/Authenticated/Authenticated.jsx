import { useState } from "react";
import "./Authenticated.css";

export default function Authenticated({ user }) {
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const linked = params.has("github_linked");
  const githubError = params.has("auth_error");

  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Sign out failed");
      window.location.replace("/");
    } catch {
      setBusy(false);
      window.alert("Unable to sign out. Please try again.");
    }
  }

  return (
    <main className="authenticated-page">
      <header className="authenticated-header">
        <span className="authenticated-brand">k ᐧ ai</span>
        <button type="button" onClick={signOut} disabled={busy}>
          {busy ? "Signing out..." : "Sign out"}
        </button>
      </header>
      <section className="authenticated-content">
        <img src="/kailor-head.png" alt="" />
        <h1>Welcome to kai.</h1>
        <p>You're signed in as {user.name}.</p>
        {linked && <p role="status">Your GitHub account is connected.</p>}
        {githubError && (
          <p role="alert">GitHub connection did not complete. Please try again.</p>
        )}
        <p className="authenticated-description">
          Your reader account is ready. The publication homepage is our next page.
        </p>
        <div className="authenticated-actions">
          <a href="/api/auth/github?link=1">Connect GitHub</a>
          {user.role === "admin" && <span>Editorial administrator</span>}
        </div>
      </section>
    </main>
  );
}
