import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Zap, Coins, LogOut, Sparkles } from "lucide-react";

const NAV = [
  { path: "/overview", label: "Overview",    icon: LayoutDashboard },
  { path: "/users",    label: "Users",        icon: Users },
  { path: "/hooks",    label: "Hooks",        icon: Zap },
  { path: "/tokens",   label: "Token Usage",  icon: Coins },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("sc_admin_token");
    navigate("/");
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0d0d0d" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: "#141414", borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "#1e1e3a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Sparkles size={16} style={{ color: "#8080ff" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7c7cf8" }}>Admin Panel</div>
            <div style={{ fontSize: 10, color: "#444", fontWeight: 600 }}>INTERNAL ONLY</div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: "none",
                background: isActive ? "#1e1e3a" : "transparent",
                color: isActive ? "#8080ff" : "#888",
                transition: "all 0.15s",
              })}
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={logout}
          style={{ margin: "0 10px 16px", padding: "9px 12px", borderRadius: 10, border: "none", background: "transparent", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500 }}
          onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#2a0a0a"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#555"; e.currentTarget.style.background = "transparent"; }}
        >
          <LogOut size={15} /> Sign Out
        </button>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: "auto", background: "#0d0d0d" }}>
        <Outlet />
      </main>
    </div>
  );
}
