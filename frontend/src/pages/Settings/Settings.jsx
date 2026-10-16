import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, useResource } from "../../hooks/api";
import { useApp } from "../../components/context";
import { Feedback } from "../../components/Common";
import "./Settings.css";
export default function Settings() {
  const { revision, refresh, toast } = useApp(),
    { data, error, loading } = useResource("/settings", revision),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm(data);
  }, [data]);
  return (
    <section className="settings-page">
      <div className="page-intro">
        <h1>Make room for your preferences.</h1>
        <p>A few small adjustments to make kai yours.</p>
      </div>
      <Feedback loading={loading} error={error}>
        {form && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/settings", { method: "PATCH", body: form });
                toast("Preferences saved.");
                refresh();
              } catch (e) {
                toast(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Reading</h2>
            <label>
              Feed density
              <select
                value={form.feed_density}
                onChange={(e) =>
                  setForm((f) => ({ ...f, feed_density: e.target.value }))
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label>
              Default discovery feed
              <select
                value={form.default_feed}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_feed: e.target.value }))
                }
              >
                <option value="for-you">For you</option>
                <option value="latest">Latest</option>
                <option value="following">Following</option>
              </select>
            </label>
            <p className="muted">
              For you prioritizes authors and topics you follow, then recent
              publications.
            </p>
            <Link className="button" to="/topics">
              Manage followed topics
            </Link>
            <h2 className="section-title">In-app notifications</h2>
            {[
              ["follow", "New followers"],
              ["like", "Publication likes"],
              ["comment", "Publication comments"],
              ["reply", "Comment replies"],
              ["moderation", "Editorial actions"],
            ].map(([event, label]) => (
              <label className="check-label" key={event}>
                <input
                  type="checkbox"
                  checked={form.notification_events.includes(event)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      notification_events: e.target.checked
                        ? [...f.notification_events, event]
                        : f.notification_events.filter((x) => x !== event),
                    }))
                  }
                />
                {label}
              </label>
            ))}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save preferences"}
            </button>
            <p>
              <Link to="/account">Account security & sessions</Link>
            </p>
          </form>
        )}
      </Feedback>
    </section>
  );
}
