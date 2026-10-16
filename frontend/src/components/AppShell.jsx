import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Home,
  Clock,
  TrendingUp,
  Compass,
  Hash,
  Users,
  Bookmark,
  Heart,
  FileText,
  Bell,
  User,
  Settings,
  Plus,
  PenLine,
  Shield,
  MoreHorizontal,
  LogOut,
  X,
  Search,
} from "lucide-react";
import { AppContext } from "./context";
import { Avatar } from "./Common";
import { api } from "../hooks/api";
const Composer = lazy(() => import("./Composer"));
import NotificationBell from "./NotificationBell";
import "./AppShell.css";
const groups = [
  [
    "Discover",
    [
      ["Home", "/", Home],
      ["Latest", "/latest", Clock],
      ["Trending", "/trending", TrendingUp],
      ["Explore", "/explore", Compass],
      ["Topics", "/topics", Hash],
      ["Following", "/following", Users],
    ],
  ],
  [
    "Library",
    [
      ["Saved", "/saved", Bookmark],
      ["Liked", "/liked", Heart],
      ["My publications", "/studio", FileText],
      ["Drafts", "/drafts", PenLine],
    ],
  ],
  [
    "Community",
    [
      ["Followers", "/followers", Users],
      ["Notifications", "/notifications", Bell],
    ],
  ],
  [
    "Personal",
    [
      ["Profile", "/profile", User],
      ["Account", "/account", User],
      ["Settings", "/settings", Settings],
    ],
  ],
];
const positions = new Map();
export default function AppShell({ user, setUser }) {
  const location = useLocation(),
    navigate = useNavigate(),
    [open, setOpen] = useState(
      () => localStorage.getItem("kai.sidebar") === "open",
    ),
    [composer, setComposer] = useState(null),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [query, setQuery] = useState(""),
    [tooltip, setTooltip] = useState(null),
    main = useRef(),
    sidebar = useRef(),
    toggle = useRef();
  const mobile = () => window.matchMedia("(max-width: 700px)").matches;
  function toast(msg) {
    setMessage(msg);
  }
  function requireUser(destination) {
    if (user) return true;
    sessionStorage.setItem(
      "kai.return",
      typeof destination === "string"
        ? destination
        : location.pathname + location.search + location.hash,
    );
    navigate("/signin");
    return false;
  }
  function compose(p = null) {
    if (requireUser()) setComposer({ publication: p });
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      navigate("/");
    } catch (e) {
      toast(e.message);
    }
  }
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    localStorage.setItem("kai.sidebar", open ? "open" : "closed");
    if (!open) return;
    const pointer = (e) => {
        if (
          !sidebar.current?.contains(e.target) &&
          !toggle.current?.contains(e.target)
        )
          setOpen(false);
      },
      key = (e) => {
        if (e.key === "Escape") {
          setOpen(false);
          toggle.current?.focus();
        }
        if (e.key === "Tab" && mobile()) {
          const nodes = [
            ...sidebar.current.querySelectorAll("a,button"),
          ].filter((n) => n.getClientRects().length);
          if (e.shiftKey && document.activeElement === nodes[0]) {
            e.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
            e.preventDefault();
            nodes[0]?.focus();
          }
        }
      };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    if (mobile()) sidebar.current?.querySelector("a")?.focus();
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  useEffect(() => {
    const node = main.current;
    const key = location.pathname + location.search;
    requestAnimationFrame(() => {
      if (node) node.scrollTop = positions.get(key) || 0;
    });
    if (mobile()) setOpen(false);
    return () => {
      if (node) positions.set(key, node.scrollTop);
    };
  }, [location.pathname, location.search]);
  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        toast,
        requireUser,
        compose,
        revision,
        refresh: () => setRevision((v) => v + 1),
      }}
    >
      <div className="application">
        <header className="app-header">
          <button
            ref={toggle}
            className="icon-button sidebar-toggle"
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <MoreHorizontal size={21} />
          </button>
          <Link className="wordmark" to="/">
            k ᐧ ai
          </Link>
          <form
            className="header-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/search?q=${encodeURIComponent(query)}`);
            }}
          >
            <Search size={16} />
            <input
              aria-label="Search kai"
              placeholder="Search ideas, people, topics"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <div className="header-account">
            <NotificationBell />
            <button
              className="icon-button"
              aria-label="New post"
              onClick={() => compose()}
            >
              <Plus size={20} />
            </button>
            {user ? (
              <>
                <Link className="header-identity" to="/profile">
                  <Avatar user={user} />
                  <span>{user.name}</span>
                </Link>
                <button
                  className="signout-control"
                  onClick={logout}
                  aria-label="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <Link className="button primary" to="/signin">
                Sign in / Join
              </Link>
            )}
          </div>
        </header>
        {open && (
          <div
            className="mobile-sidebar-backdrop"
            onClick={() => setOpen(false)}
          />
        )}
        <aside
          ref={sidebar}
          className={`sidebar ${open ? "expanded" : ""}`}
          aria-label="Main navigation"
        >
          <nav>
            {groups.map(([label, entries]) => (
              <div className="nav-group" key={label}>
                <p className="nav-heading">{label}</p>
                {entries.map(([label, path, Icon]) => (
                  <NavLink
                    key={path}
                    end={path === "/"}
                    to={path}
                    aria-label={label}
                    onMouseEnter={(e) => {
                      if (!open)
                        setTooltip({
                          label,
                          top: e.currentTarget.getBoundingClientRect().top,
                        });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(e) => {
                      if (!open)
                        setTooltip({
                          label,
                          top: e.currentTarget.getBoundingClientRect().top,
                        });
                    }}
                    onBlur={() => setTooltip(null)}
                  >
                    <Icon size={18} />
                    <span className="nav-label">{label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
            <div className="nav-group">
              <p className="nav-heading">Authoring</p>
              <button onClick={() => compose()} title="New post">
                <Plus size={18} />
                <span className="nav-label">New post</span>
              </button>
              <NavLink to="/studio" title="My studio">
                <PenLine size={18} />
                <span className="nav-label">My studio</span>
              </NavLink>
              {user?.role === "admin" && (
                <NavLink to="/editorial" title="Editorial dashboard">
                  <Shield size={18} />
                  <span className="nav-label">Editorial dashboard</span>
                </NavLink>
              )}
            </div>
          </nav>
          <div className="sidebar-account">
            <Link to={user ? "/account" : "/signin"}>
              <Avatar user={user || { name: "Guest" }} />
              <span className="nav-label">
                {user?.name || "Sign in to kai"}
              </span>
            </Link>
            {open && user && (
              <button onClick={logout}>
                <LogOut size={17} /> Sign out
              </button>
            )}
          </div>
        </aside>
        {tooltip && !open && (
          <div
            role="tooltip"
            className="rail-tooltip"
            style={{ top: tooltip.top }}
          >
            {tooltip.label}
          </div>
        )}
        <main ref={main} className="app-main" id="main-content">
          <Outlet />
        </main>
        {message && (
          <div className="toast" role="status">
            {message}
            <button
              className="close"
              aria-label="Dismiss message"
              onClick={() => setMessage("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
      {composer && (
        <Suspense
          fallback={
            <div className="toast" role="status">
              Opening editor…
            </div>
          }
        >
          <Composer
            publication={composer.publication}
            onClose={() => setComposer(null)}
            onSaved={() => setRevision((v) => v + 1)}
          />
        </Suspense>
      )}
    </AppContext.Provider>
  );
}
