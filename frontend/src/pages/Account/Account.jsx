import { useState } from "react";
import { Link } from "react-router-dom";
import { api, date } from "../../hooks/api";
import { useApp } from "../../components/context";
import { Avatar, Modal } from "../../components/Common";
import "./Account.css";
export default function Account() {
  const { user, setUser, toast } = useApp(),
    [password, setPassword] = useState(""),
    [current, setCurrent] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  async function passwordSave(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/security/password", {
        method: "POST",
        body: { password, current_password: current },
      });
      setPassword("");
      setCurrent("");
      setUser({ ...user, password_connected: true });
      toast("Password updated. Other sessions have been signed out.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-page">
      <div className="page-intro">
        <h1>Your account.</h1>
        <p>A home for your reading and writing.</p>
      </div>
      <div className="account-identity">
        <Avatar user={user} large />
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Link className="button" to="/profile">
            Manage profile
          </Link>
        </div>
      </div>
      <dl className="account-details">
        <dt>Member since</dt>
        <dd>{date(user.created_at)}</dd>
        <dt>Access</dt>
        <dd>
          {user.role === "admin"
            ? "Editorial administrator"
            : "Reader & independent author"}
        </dd>
        <dt>Email</dt>
        <dd>{user.email_verified ? "Verified" : "Not yet verified"}</dd>
        <dt>GitHub</dt>
        <dd>
          {user.github_connected ? (
            "Connected"
          ) : (
            <a className="button" href="/api/auth/github?link=1">
              Connect GitHub
            </a>
          )}
        </dd>
        <dt>Password</dt>
        <dd>{user.password_connected ? "Connected" : "No password set"}</dd>
      </dl>
      {!user.email_verified && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const d = await api("/security/email/verify", { method: "POST" });
              toast(
                d.delivery === "local-outbox"
                  ? "Verification email written to the configured local outbox."
                  : "Verification email submitted to SMTP.",
              );
            } catch (e) {
              toast(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send verification link
        </button>
      )}
      <h2 className="section-title">
        {user.password_connected ? "Change password" : "Set a password"}
      </h2>
      <form className="account-password" onSubmit={passwordSave}>
        {user.password_connected && (
          <label>
            Current password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
        )}
        <label>
          New password
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button disabled={busy} className="primary">
          Update password
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <h2 className="section-title">Your sessions</h2>
      <p className="muted">Sign out other devices if you no longer use them.</p>
      <button onClick={() => setConfirm(true)}>Sign out other sessions</button>
      <p>
        <Link to="/security">Password recovery</Link>
      </p>
      {confirm && (
        <Modal
          title="Sign out other devices?"
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          <p>You will stay signed in on this device.</p>
          <div className="actions">
            <button disabled={busy} onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/security/sessions/revoke", { method: "POST" });
                  setConfirm(false);
                  toast("Other sessions signed out.");
                } catch (e) {
                  toast(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sign out other sessions
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
