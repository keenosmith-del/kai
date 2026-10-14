import { useState } from "react";
import "./SignIn.css";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      const data = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Authentication is not connected yet."
            : data.error ||
                data.message ||
                "Unable to sign in. Please try again.",
        );
      }

      setPassword("");
      setStatus({
        type: "success",
        message: "Signed in successfully.",
      });

      // Connect authenticated navigation when the
      // reader homepage and session handling are ready.
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Unable to connect to the server.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-brand">
        <div className="signin-brand-content">
          <h1 className="signin-wordmark">k ᐧ ai</h1>

          <p className="signin-description">
            An independent publication exploring artificial intelligence,
            research, emerging tools and the ideas shaping what comes next.
          </p>
        </div>
      </section>

      <section className="signin-panel">
        <div className="signin-container">
          <div className="signin-intro">
            <img src="/kailor-head.png" alt="" className="signin-mascot" />

            <h2>Welcome back.</h2>

            <p>Sign in to continue.</p>
          </div>

          <form className="signin-form" onSubmit={handleSubmit}>
            <div className="signin-field">
              <label htmlFor="email">Email address</label>

              <input
                id="email"
                type="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="signin-field">
              <label htmlFor="password">Password</label>

              <div className="signin-password">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  required
                />

                <button
                  type="button"
                  className="signin-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {status && (
              <p
                className={`signin-status ${status.type}`}
                role={status.type === "error" ? "alert" : "status"}
              >
                {status.message}
              </p>
            )}

            <button type="submit" className="signin-submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>

      <footer className="signin-footer">
        <span>© {new Date().getFullYear()} kai.</span>
      </footer>
    </main>
  );
}
