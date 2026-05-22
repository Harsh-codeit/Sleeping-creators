import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT_USER = { role: "owner", name: "Admin", email: "", permissions: null };

const UserContext = createContext(DEFAULT_USER);

export function UserProvider({ children, token }) {
  const [user, setUser] = useState(DEFAULT_USER);

  useEffect(() => {
    if (!token) {
      setUser(DEFAULT_USER);
      return;
    }
    axios.get(`${API}/me`)
      .then(r => setUser(r.data))
      .catch(() => setUser(DEFAULT_USER));
  }, [token]);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
