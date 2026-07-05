import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Zap, Coins, LogOut, Sparkles, Menu, X, ChevronsLeft, ChevronsRight } from "lucide-react";

const NAV = [
  { path: "/overview", label: "Overview",     icon: LayoutDashboard },
  { path: "/users",    label: "Users",         icon: Users },
  { path: "/hooks",    label: "Hooks",         icon: Zap },
  { path: "/tokens",   label: "Token Usage",   icon: Coins },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [mobile, setMobile]       = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const logout = () => {
    localStorage.removeItem("sc_admin_token");
    navigate("/");
  };

  const Logo = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: "#1e1e3a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Sparkles size={16} style={{ color: "#8080ff" }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7c7cf8" }}>Admin Panel</div>
        <div style={{ fontSize: 10, color: "#444", fontWeight: 600 }}>INTERNAL ONLY</div>
      </div>
    </div>
  );

  /* ── Desktop layout ─────────────────────────────────────────── */
  if (!mobile) {
    const w = collapsed ? 60 : 220;
    return (
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0d0d0d" }}>
        <aside style={{ width: w, flexShrink: 0, background: "#141414", borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column", transition: "width 0.2s ease", overflow: "hidden" }}>

          {/* Logo / icon */}
          <div style={{ padding: collapsed ? "18px 0" : "20px 16px 16px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: collapsed ? "center" : "flex-start" }}>
            {collapsed
              ? <Sparkles size={18} style={{ color: "#8080ff" }} />
              : <Logo />
            }
          </div>

          {/* Nav links */}
          <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map(({ path, label, icon: Icon }) => (
              <NavLink key={path} to={path} title={collapsed ? label : undefined} style={({ isActive }) => ({
                display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
                gap: 10, padding: collapsed ? "9px 0" : "9px 12px",
                borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: "none",
                background: isActive ? "#1e1e3a" : "transparent",
                color: isActive ? "#8080ff" : "#888",
              })}>
                <Icon size={15} />
                {!collapsed && label}
              </NavLink>
            ))}
          </nav>

          {/* Sign out */}
          <button onClick={logout} title={collapsed ? "Sign Out" : undefined} style={{ margin: collapsed ? "0 8px 4px" : "0 10px 4px", padding: collapsed ? "9px 0" : "9px 12px", borderRadius: 10, border: "none", background: "transparent", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, fontSize: 13, fontWeight: 500 }}>
            <LogOut size={15} />
            {!collapsed && "Sign Out"}
          </button>

          {/* Collapse / Expand button */}
          <button onClick={() => setCollapsed(c => !c)} style={{ margin: collapsed ? "0 8px 16px" : "0 10px 16px", padding: collapsed ? "9px 0" : "9px 12px", borderRadius: 10, border: "1px solid #2a2a2a", background: "transparent", color: "#555", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, fontSize: 13, fontWeight: 500 }}>
            {collapsed ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /> Collapse</>}
          </button>

        </aside>
        <main style={{ flex: 1, overflowY: "auto", background: "#0d0d0d" }}>
          <Outlet />
        </main>
      </div>
    );
  }

  /* ── Mobile layout ──────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0d0d0d", overflow: "hidden" }}>

      {/* Top bar */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#141414", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
        <Logo />
        <button onClick={() => setSidebar(o => !o)} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", padding: 4 }}>
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Slide-down menu overlay */}
      {sidebarOpen && (
        <div style={{ position: "fixed", top: 57, left: 0, right: 0, bottom: 0, zIndex: 50, background: "rgba(0,0,0,0.7)" }} onClick={() => setSidebar(false)}>
          <div style={{ background: "#141414", borderBottom: "1px solid #2a2a2a", padding: "8px 12px 12px" }} onClick={e => e.stopPropagation()}>
            {NAV.map(({ path, label, icon: Icon }) => (
              <NavLink key={path} to={path} onClick={() => setSidebar(false)} style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                borderRadius: 12, fontSize: 14, fontWeight: 500, textDecoration: "none",
                background: isActive ? "#1e1e3a" : "transparent",
                color: isActive ? "#8080ff" : "#ccc",
                marginBottom: 2,
              })}>
                <Icon size={17} />{label}
              </NavLink>
            ))}
            <button onClick={logout} style={{ width: "100%", marginTop: 8, padding: "12px 14px", borderRadius: 12, border: "none", background: "#2a0a0a", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 500 }}>
              <LogOut size={17} /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Page content */}
      <main style={{ flex: 1, overflowY: "auto", background: "#0d0d0d" }}>
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav style={{ display: "flex", background: "#141414", borderTop: "1px solid #2a2a2a", flexShrink: 0 }}>
        {NAV.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} style={({ isActive }) => ({
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "10px 0 12px", gap: 4, textDecoration: "none",
            color: isActive ? "#8080ff" : "#555",
            borderTop: isActive ? "2px solid #8080ff" : "2px solid transparent",
            fontSize: 10, fontWeight: 600,
          })}>
            <Icon size={18} />
            {label.split(" ")[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
