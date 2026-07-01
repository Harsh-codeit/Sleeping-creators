import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import {
  LayoutDashboard, LayoutTemplate, CalendarRange, BarChart3,
  Settings, Layers, LogOut, Sparkles, User, ChevronDown
} from "lucide-react";
import { useState } from "react";
import { useUser } from "../context/UserContext";
import ErrorBoundary from "./ErrorBoundary";

const BOTTOM_NAV = [
  { path: "/",          label: "Home",      icon: LayoutDashboard, exact: true },
  { path: "/create",    label: "Create",    icon: Layers },
  { path: "/templates", label: "Templates", icon: LayoutTemplate },
  { path: "/calendar",  label: "Calendar",  icon: CalendarRange },
  { path: "/settings",  label: "Settings",  icon: Settings },
];

const SIDEBAR_NAV = [
  { path: "/",             label: "Dashboard",   icon: LayoutDashboard, exact: true },
  { path: "/carousel",     label: "Create",      icon: Layers },
  { path: "/templates",    label: "Templates",   icon: LayoutTemplate },
  { path: "/calendar",     label: "Calendar",    icon: CalendarRange },
  { path: "/analytics",    label: "Analytics",   icon: BarChart3 },
  { path: "/hook-library", label: "Inspiration", icon: Sparkles },
  { path: "/settings",     label: "Settings",    icon: Settings },
];

function isActive(nav, pathname) {
  if (nav.exact) return pathname === nav.path;
  return pathname.startsWith(nav.path);
}

export default function Layout({ onLogout }) {
  const location              = useLocation();
  const navigate              = useNavigate();
  const { name, email, role } = useUser() ?? {};
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const initials = name
    ? name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "SC";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0d0d0d" }}>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col"
        style={{ background: "#141414", borderRight: "1px solid #2a2a2a" }}>

        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4" style={{ borderBottom: "1px solid #2a2a2a" }}>
          <img src={logo} alt="Sleeping Creators" className="w-7 h-7 rounded-lg" />
          <div>
            <div className="text-sm font-bold tracking-tight" style={{ color: "#7c7cf8" }}>Sleeping Creators</div>
            <div className="text-[10px] font-medium" style={{ color: "#555" }}>CONTENT STUDIO</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {SIDEBAR_NAV.map(nav => {
            const Icon   = nav.icon;
            const active = isActive(nav, location.pathname);
            return (
              <NavLink
                key={nav.path}
                to={nav.path}
                data-testid={`nav-${nav.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-all"
                style={active
                  ? { background: "#1e1e3a", color: "#8080ff", fontWeight: 600 }
                  : { color: "#888" }
                }
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#1a1a1a"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = ""; }}
              >
                <Icon size={15} />
                <span>{nav.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3" style={{ borderTop: "1px solid #2a2a2a" }}>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors"
              style={{ color: "#ccc" }}
              onMouseEnter={e => e.currentTarget.style.background = "#1a1a1a"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{ background: "#1e1e3a", color: "#8080ff" }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-xs font-semibold truncate" style={{ color: "#fff" }}>
                  {name || (role === "owner" ? "Admin" : "User")}
                </div>
                {email && <div className="text-[10px] truncate" style={{ color: "#555" }}>{email}</div>}
              </div>
              <ChevronDown size={13} style={{ color: "#444", flexShrink: 0, transform: userMenuOpen ? "rotate(180deg)" : "" }} />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl overflow-hidden shadow-lg z-50"
                style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                <NavLink
                  to="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors"
                  style={{ color: "#ccc" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#2a2a2a"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <User size={13} /> Profile & Settings
                </NavLink>
                <div style={{ height: 1, background: "#2a2a2a" }} />
                <button
                  data-testid="logout-btn"
                  onClick={() => { setUserMenuOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors"
                  style={{ color: "#888" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#2a0a0a"; e.currentTarget.style.color = "#ef4444"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "#888"; }}
                >
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center px-4 h-14 flex-shrink-0"
          style={{ background: "#141414", borderBottom: "1px solid #2a2a2a", paddingTop: "env(safe-area-inset-top)" }}>
          <img src={logo} alt="" className="w-6 h-6 rounded-md" />
          <span className="text-sm font-bold ml-2" style={{ color: "#7c7cf8" }}>Sleeping Creators</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0" style={{ background: "#0d0d0d" }}>
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* ── Mobile bottom nav ── */}
        <nav className="md:hidden flex items-center"
          style={{ background: "#141414", borderTop: "1px solid #2a2a2a", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {BOTTOM_NAV.map(nav => {
            const Icon   = nav.icon;
            const active = isActive(nav, location.pathname);
            return (
              <NavLink
                key={nav.path}
                to={nav.path}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors"
                style={{ color: active ? "#8080ff" : "#555" }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium">{nav.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

    </div>
  );
}
