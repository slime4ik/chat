import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "./lib/api.js";
import { getToken, clearAuth } from "./lib/auth.js";
import AuthScreen from "./components/AuthScreen.jsx";
import Messenger from "./components/Messenger.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Restore a session if a token is present.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (getToken()) {
        try {
          const me = await api.me();
          if (alive) setUser(me);
        } catch {
          clearAuth();
        }
      }
      if (alive) setBooting(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Server told us the token is dead.
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("pc:logout", onLogout);
    return () => window.removeEventListener("pc:logout", onLogout);
  }, []);

  function handleLogout() {
    clearAuth();
    setUser(null);
  }

  if (booting) {
    return (
      <div className="h-full grid place-items-center text-slate-500">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (!user) return <AuthScreen onAuthed={setUser} />;
  return <Messenger me={user} setMe={setUser} onLogout={handleLogout} />;
}
