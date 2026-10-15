import { useEffect, useState } from "react";
import SignIn from "./pages/SignIn/SignIn";
import Authenticated from "./pages/Authenticated/Authenticated";

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
        if (!response.ok) throw new Error("Unable to load session");
        return response.json();
      })
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.error("Session check failed:", error.message);
          setUser(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
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

  return user ? <Authenticated user={user} /> : <SignIn />;
}
