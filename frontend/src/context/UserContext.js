import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT = {
  role: "owner",
  name: "Admin",
  email: "",
  client_id: null,
  niche: "",
  onboarding_complete: true,
  permissions: null,
};

const UserContext = createContext(null);

export function UserProvider({ children, token }) {
  const [user, setUser] = useState(token ? null : { role: "guest" });

  const fetchUser = useCallback(() => {
    if (!token) { setUser({ role: "guest" }); return; }
    setUser(null);
    axios.get(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const data = r.data;
        setUser({ ...DEFAULT, ...data, client_id: data.client_id || data.id || null });
      })
      .catch(() => setUser(DEFAULT));
  }, [token]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  // Expose refreshUser so components can force a re-fetch after state changes
  const value = user ? { ...user, refreshUser: fetchUser } : null;

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
