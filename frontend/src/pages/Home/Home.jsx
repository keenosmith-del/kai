import { useState } from "react";
import "./Home.css";

export default function Home({ user }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Unable to sign out");
      }

      window.location.replace("/signin");
    } catch {
      setBusy(false);
      window.alert("Unable to sign out. Please try again.");
    }
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <span className="home-brand">k ᐧ ai</span>

        <div className="home-account">
          <span>{user.name}</span>

          <button type="button" onClick={signOut} disabled={busy}>
            Sign out
          </button>
        </div>
      </header>

      <section className="home-content">
        <h1>A clearer view of artificial intelligence.</h1>

        <p>
          Research, tools and ideas shaping what comes next — selected,
          explained and put into context.
        </p>

        <div className="home-account-actions">
          {!user.github_connected ? (
            <a href="/api/auth/github?link=1">Connect GitHub</a>
          ) : (
            <span>GitHub connected</span>
          )}

          {user.role === "admin" && <span>Editorial administrator</span>}
        </div>
      </section>

      <footer className="home-footer">© {new Date().getFullYear()} kai.</footer>
    </main>
  );
}
