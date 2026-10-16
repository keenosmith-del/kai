import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, date } from "../../hooks/api";
import { Avatar, Empty, Feedback } from "../../components/Common";
import { eventText } from "../../hooks/notificationEvents";
import "./Notifications.css";
export default function Notifications() {
  const [state, set] = useState({
      items: [],
      loading: true,
      error: "",
      unread: 0,
    }),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api(`/notifications?page=${page}`)
      .then((d) => {
        if (active)
          set((old) => ({
            ...d,
            items: page === 1 ? d.items : [...old.items, ...d.items],
            loading: false,
            error: "",
          }));
      })
      .catch((e) => {
        if (active)
          set((old) => ({ ...old, error: e.message, loading: false }));
      });
    return () => {
      active = false;
    };
  }, [page, version]);
  async function read(id) {
    if (busy) return;
    setBusy(true);
    try {
      await api("/notifications/read", { method: "PATCH", body: { id } });
      set((old) => ({
        ...old,
        items: old.items.map((n) =>
          !id || id === n.id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      }));
      if (!id) {
        setPage(1);
        setVersion((n) => n + 1);
      }
      window.dispatchEvent(new Event("focus"));
    } catch (e) {
      set((old) => ({ ...old, error: e.message }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="notifications-page">
      <div className="page-intro">
        <h1>Your conversations.</h1>
        <p>Updates from the people reading with you.</p>
        <button disabled={busy} onClick={() => read()}>
          Mark all as read
        </button>
      </div>
      <Feedback loading={state.loading} error={state.error}>
        {state.items.length ? (
          state.items.map((n) => (
            <article
              className={`notification-full ${!n.read_at ? "unread" : ""}`}
              key={n.id}
            >
              <Avatar
                user={{
                  name: n.actor_name || "Editorial",
                  avatar_url: n.actor_avatar,
                }}
              />
              <Link to={n.destination} onClick={() => read(n.id)}>
                {n.actor_name || "The editorial team"} {eventText[n.event]}.
                <small className="muted">{date(n.created_at)}</small>
              </Link>
              {!n.read_at && (
                <button disabled={busy} onClick={() => read(n.id)}>
                  Mark read
                </button>
              )}
            </article>
          ))
        ) : (
          <Empty title="You're all caught up.">
            Follows, likes and conversations will appear here.
          </Empty>
        )}
      </Feedback>
      {state.hasMore && (
        <button onClick={() => setPage((p) => p + 1)}>Load more</button>
      )}
    </section>
  );
}
