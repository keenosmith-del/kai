import { useEffect, useRef, useState } from "react";
import "./SignIn.css";

const TRANSITION_MS = 240;

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.85 10.91.58.11.79-.25.79-.56v-2.17c-3.19.7-3.86-1.35-3.86-1.35-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.24 3.33.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18A10.97 10.97 0 0 1 12 6.32c.97 0 1.95.13 2.86.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.77 1.03.77 2.08v3.08c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export default function SignIn() {
  const [mode, setMode] = useState("signin");
  const [isSwitching, setIsSwitching] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const transitionTimer = useRef(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const isSignup = mode === "signup";

  useEffect(() => {
    return () => clearTimeout(transitionTimer.current);
  }, []);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (status?.type === "error") {
      setStatus(null);
    }
  }

  function switchMode(nextMode, message = null) {
    if (loading || isSwitching || mode === nextMode) return;

    setIsSwitching(true);
    setStatus(null);

    transitionTimer.current = setTimeout(() => {
      setMode(nextMode);
      setShowPassword(false);

      setForm((previous) => ({
        ...previous,
        password: "",
        confirmPassword: "",
      }));

      if (message) {
        setStatus({
          type: "success",
          message,
        });
      }

      setIsSwitching(false);
    }, TRANSITION_MS);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || isSwitching) return;

    setStatus(null);

    if (isSignup) {
      if (form.name.trim().length < 2) {
        setStatus({
          type: "error",
          message: "Please enter your full name.",
        });
        return;
      }

      if (form.password.length < 8) {
        setStatus({
          type: "error",
          message: "Your password must contain at least 8 characters.",
        });
        return;
      }

      if (form.password !== form.confirmPassword) {
        setStatus({
          type: "error",
          message: "Your passwords do not match.",
        });
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = isSignup ? "/api/auth/register" : "/api/auth/login";

      const payload = isSignup
        ? {
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
          }
        : {
            email: form.email.trim(),
            password: form.password,
          };

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
                "Unable to continue. Please try again.",
        );
      }

      setForm((previous) => ({
        ...previous,
        password: "",
        confirmPassword: "",
      }));

      window.location.replace("/");
      return;
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Unable to connect to the server.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleGitHubSignIn() {
    window.location.assign("/api/auth/github");
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
        <div
          className={`signin-container ${
            isSwitching ? "is-transitioning" : ""
          }`}
        >
          <div className="signin-intro">
            <img src="/kailor-head.png" alt="" className="signin-mascot" />

            <h2>{isSignup ? "Create your account." : "Welcome back."}</h2>

            <p>
              {isSignup
                ? "Join kai and explore what comes next."
                : "Sign in to continue exploring kai."}
            </p>
          </div>

          <form className="signin-form" onSubmit={handleSubmit}>
            {isSignup && (
              <div className="signin-field">
                <label htmlFor="name">Full name</label>

                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Your name"
                  autoComplete="name"
                  value={form.name}
                  onChange={updateField}
                  disabled={loading}
                  required
                />
              </div>
            )}

            <div className="signin-field">
              <label htmlFor="email">Email address</label>

              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={updateField}
                disabled={loading}
                required
              />
            </div>

            <div className="signin-field">
              <label htmlFor="password">Password</label>

              <div className="signin-password">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={
                    isSignup ? "Create a password" : "Enter your password"
                  }
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={isSignup ? 8 : undefined}
                  value={form.password}
                  onChange={updateField}
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

            {isSignup && (
              <div className="signin-field">
                <label htmlFor="confirmPassword">Confirm password</label>

                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={updateField}
                  disabled={loading}
                  required
                />
              </div>
            )}

            {status && (
              <p
                className={`signin-status ${status.type}`}
                role={status.type === "error" ? "alert" : "status"}
              >
                {status.message}
              </p>
            )}

            <button
              type="submit"
              className="signin-submit"
              disabled={loading || isSwitching}
            >
              {loading
                ? "Please wait..."
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>

            <button
              type="button"
              className="signin-github"
              onClick={handleGitHubSignIn}
              disabled={loading || isSwitching}
            >
              <GitHubIcon />
              <span>Continue with GitHub</span>
            </button>
          </form>

          <div className="signin-auth-switch">
            <span>{isSignup ? "Already have an account?" : "New to kai?"}</span>

            <button
              type="button"
              onClick={() => switchMode(isSignup ? "signin" : "signup")}
              disabled={loading || isSwitching}
            >
              {isSignup ? "Sign in" : "Create account"}
            </button>
          </div>
        </div>
      </section>

      <footer className="signin-footer">
        <span>© {new Date().getFullYear()} kai.</span>
      </footer>
    </main>
  );
}
