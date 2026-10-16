import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../hooks/api";
import "./Security.css";
export default function Security() {
  const [params] = useSearchParams(),
    purpose = params.get("purpose"),
    token = params.get("token"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <section className="security-page">
      <div className="page-intro">
        <h1>
          {purpose === "verify"
            ? "Verify your email."
            : token
              ? "A fresh start."
              : "Recover your account."}
        </h1>
      </div>
      {done ? (
        <>
          <p role="status">{message}</p>
          <Link className="button" to="/signin">
            Continue to sign in
          </Link>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(
                token ? "/security/token" : "/security/password/forgot",
                {
                  method: "POST",
                  body: token ? { purpose, token, password } : { email },
                },
              );
              setDone(true);
              setMessage(
                token
                  ? purpose === "verify"
                    ? "Email verified."
                    : "Password updated. Sign in with your new password."
                  : "If this address has an account, a recovery message has been submitted to the configured mail service or local outbox.",
              );
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {!token && (
            <label>
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {token && purpose === "reset" && (
            <label>
              New password
              <input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : purpose === "verify"
                ? "Verify email"
                : token
                  ? "Reset password"
                  : "Request recovery link"}
          </button>
        </form>
      )}
    </section>
  );
}
