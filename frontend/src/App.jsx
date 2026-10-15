import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import SignIn from "./pages/SignIn/SignIn";
import Welcome from "./pages/Welcome/Welcome";
import Home from "./pages/Home/Home";

function AppRoutes({ user }) {
  const location = useLocation();

  const needsWelcome = user && !user.onboarding_completed_at;

  const destination = needsWelcome ? "/welcome" : "/";

  return (
    <Routes>
      <Route
        path="/signin"
        element={user ? <Navigate to={destination} replace /> : <SignIn />}
      />

      <Route
        path="/welcome"
        element={
          !user ? (
            <Navigate to="/signin" replace />
          ) : needsWelcome ? (
            <Welcome user={user} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/"
        element={
          !user ? (
            <Navigate to={`/signin${location.search}`} replace />
          ) : needsWelcome ? (
            <Navigate to="/welcome" replace />
          ) : (
            <Home user={user} />
          )
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/auth/me", {
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load session");
        }

        return response.json();
      })
      .then((data) => {
        setUser(data.user);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.error(error);
          setUser(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <main className="kai-loading" aria-live="polite">
        <span>kai</span>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <AppRoutes user={user} />
    </BrowserRouter>
  );
}
