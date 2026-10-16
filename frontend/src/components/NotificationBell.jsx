import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../hooks/api";
import { useApp } from "./context";
import { eventText } from "../hooks/notificationEvents";
export default function NotificationBell() {
  const { user, toast } = useApp(),
    userId = user?.id,
    [data, setData] = useState({ items: [], unread: 0 }),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    ref = useRef(),
    trigger = useRef();
  async function refresh() {
    try {
      setData(await api("/notifications"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (!userId) return;
    refresh();
    const focus = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 90000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [userId]);
  useEffect(() => {
    if (!open) return;
    refresh();
    const click = (e) => {
        if (!ref.current?.contains(e.target)) setOpen(false);
      },
      key = (e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      };
    document.addEventListener("pointerdown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!user) return null;
  async function read(id) {
    try {
      await api("/notifications/read", { method: "PATCH", body: { id } });
      await refresh();
    } catch (e) {
      toast(e.message);
    }
  }
  return (
    <div className="notification-bell" ref={ref}>
      <button
        ref={trigger}
        aria-label={`Notifications, ${data.unread} unread`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={19} />
        {data.unread > 0 && (
          <span className="unread-badge">
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-panel popover">
          <div className="actions">
            <strong>Notifications</strong>
            <button className="push-right" onClick={() => read()}>
              Mark all read
            </button>
          </div>
          {error ? (
            <p role="alert">{error}</p>
          ) : data.items.length ? (
            data.items.slice(0, 5).map((n) => (
              <Link
                className={`notification-row ${!n.read_at ? "unread" : ""}`}
                key={n.id}
                to={n.destination}
                onClick={() => {
                  read(n.id);
                  setOpen(false);
                }}
              >
                {n.actor_name || "The editorial team"} {eventText[n.event]}.
              </Link>
            ))
          ) : (
            <p className="muted">You're all caught up.</p>
          )}
          <Link onClick={() => setOpen(false)} to="/notifications">
            All notifications
          </Link>
        </div>
      )}
    </div>
  );
}
