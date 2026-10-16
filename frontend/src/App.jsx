import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import SignIn from "./pages/SignIn/SignIn";
import Welcome from "./pages/Welcome/Welcome";
import Home from "./pages/Home/Home";
import Latest from "./pages/Latest/Latest";
import Trending from "./pages/Trending/Trending";
import Explore from "./pages/Explore/Explore";
import Search from "./pages/Search/Search";
import Topics from "./pages/Topics/Topics";
import Publication from "./pages/Publication/Publication";
import Saved from "./pages/Saved/Saved";
import Liked from "./pages/Liked/Liked";
import Following from "./pages/Following/Following";
import Followers from "./pages/Followers/Followers";
import Notifications from "./pages/Notifications/Notifications";
import Profile from "./pages/Profile/Profile";
import Account from "./pages/Account/Account";
import Settings from "./pages/Settings/Settings";
import MyStudio from "./pages/MyStudio/MyStudio";
import EditorialStudio from "./pages/EditorialStudio/EditorialStudio";
import Security from "./pages/Security/Security";
import AppShell from "./components/AppShell";
function Guard({ user, children, admin = false }) {
  const location = useLocation();
  useEffect(() => {
    if (!user)
      sessionStorage.setItem("kai.return", location.pathname + location.search);
  }, [user, location.pathname, location.search]);
  return !user ? (
    <Navigate to="/signin" replace />
  ) : admin && user.role !== "admin" ? (
    <section className="empty">
      <h1>Editorial access required.</h1>
      <p>This workspace is available to administrators.</p>
    </section>
  ) : (
    children
  );
}
function LegacyHome() {
  const [params] = useSearchParams();
  return params.get("publication") ? (
    <Navigate replace to={`/stories/${params.get("publication")}`} />
  ) : (
    <Home />
  );
}
function AppRoutes({ user, setUser }) {
  const welcome = !!user && !user.onboarding_completed_at,
    location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    const path = sessionStorage.getItem("kai.return");
    if (
      user &&
      !welcome &&
      location.pathname === "/" &&
      path?.startsWith("/") &&
      !path.startsWith("//") &&
      !["/signin", "/welcome"].includes(path)
    ) {
      sessionStorage.removeItem("kai.return");
      navigate(path, { replace: true });
    }
  }, [user, welcome, location.pathname, navigate]);
  if (welcome && location.pathname !== "/welcome")
    return <Navigate to="/welcome" replace />;
  return (
    <Routes>
      <Route
        path="/signin"
        element={
          user ? (
            <Navigate to={welcome ? "/welcome" : "/"} replace />
          ) : (
            <SignIn />
          )
        }
      />
      <Route
        path="/welcome"
        element={
          !user ? (
            <Navigate to="/signin" replace />
          ) : welcome ? (
            <Welcome user={user} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route element={<AppShell user={user} setUser={setUser} />}>
        <Route index element={<LegacyHome />} />
        <Route path="latest" element={<Latest />} />
        <Route path="trending" element={<Trending />} />
        <Route path="explore" element={<Explore />} />
        <Route path="search" element={<Search />} />
        <Route path="topics" element={<Topics />} />
        <Route path="topics/:topic" element={<Topics />} />
        <Route path="stories/:slug" element={<Publication />} />
        <Route path="publications/:slug" element={<Publication />} />
        <Route path="u/:handle" element={<Profile />} />
        <Route path="u/:handle/followers" element={<Followers />} />
        <Route
          path="u/:handle/following"
          element={<Followers kind="following" />}
        />
        <Route path="security" element={<Security />} />
        {[
          ["saved", Saved],
          ["liked", Liked],
          ["following", Following],
          ["followers", Followers],
          ["notifications", Notifications],
          ["profile", Profile],
          ["account", Account],
          ["settings", Settings],
          ["studio", MyStudio],
          ["drafts", MyStudio, { drafts: true }],
        ].map(([path, Component, props]) => (
          <Route
            key={path}
            path={path}
            element={
              <Guard user={user}>
                <Component {...props} />
              </Guard>
            }
          />
        ))}
        <Route
          path="editorial"
          element={
            <Guard user={user} admin>
              <EditorialStudio />
            </Guard>
          }
        />
        <Route
          path="*"
          element={
            <section className="empty">
              <h1>This page isn't here.</h1>
              <a className="button" href="/">
                Return to kai
              </a>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
export default function App() {
  const [state, setState] = useState({
      loading: true,
      error: false,
      user: null,
    }),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "include", signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        if (!controller.signal.aborted)
          setState({ loading: false, error: false, user: d.user });
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setState((s) => ({ ...s, loading: false, error: true }));
      });
    return () => controller.abort();
  }, [attempt]);
  if (state.loading)
    return (
      <main className="initial-state" role="status">
        k ᐧ ai
      </main>
    );
  if (state.error)
    return (
      <main className="initial-state">
        <h1>Unable to connect to kai.</h1>
        <p>
          Your session has not been changed. Try again when your connection
          returns.
        </p>
        <button
          onClick={() => {
            setState((s) => ({ ...s, loading: true }));
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </main>
    );
  return (
    <BrowserRouter>
      <AppRoutes
        user={state.user}
        setUser={(user) => setState((s) => ({ ...s, user }))}
      />
    </BrowserRouter>
  );
}
