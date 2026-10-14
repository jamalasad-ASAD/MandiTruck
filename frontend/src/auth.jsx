import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api.js";
import { getToken, setToken } from "./token.js";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Restore session on load
  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const r = await api.me();
          setUser(r.user);
        } catch (_) {
          setToken("");
        }
      }
      setReady(true);
    })();
  }, []);

  // api.js fires this on any 401
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  async function login(email, password) {
    const r = await api.login(email, password);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  }

  function logout() {
    setToken("");
    setUser(null);
  }

  return <Ctx.Provider value={{ user, ready, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
