import { Outlet, NavLink, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";
import {
  LayoutDashboard, Users, LayoutTemplate, CalendarRange, BarChart3,
  Terminal, Settings, Circle, Layers, LogOut, Star, Coins, Music2, Film, UserCog, AlertTriangle, Mail
} from "lucide-react";
import { useState, useEffect } from "react";
import axios from "axios";
import { useUser } from "../context/UserContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const NAV = [
  { path: "/",                label: "Dashboard", icon: LayoutDashboard, exact: true,  resource: "dashboard" },
  { path: "/clients",         label: "Clients",   icon: Users,                          resource: "clients" },
  { path: "/templates",       label: "Templates", icon: LayoutTemplate,                 resource: "templates" },
  { path: "/calendar",        label: "Calendar",  icon: CalendarRange,                  resource: "calendar" },
  { path: "/carousel",        label: "Studio",    icon: Layers,                         resource: "studio" },
  { path: "/music",           label: "Music",     icon: Music2,                         resource: "music" },
  { path: "/video-templates", label: "Video",     icon: Film,                           resource: "video_templates" },
  { path: "/analytics",       label: "Analytics", icon: BarChart3,                      resource: "analytics" },
  { path: "/dropbox",         label: "Dropbox",   icon: Star,                           resource: "dropbox" },
  { path: "/logs",            label: "Logs",      icon: Terminal,                       resource: "logs" },
  { path: "/usage",           label: "Usage",     icon: Coins,                          resource: "usage" },
  { path: "/settings",        label: "Settings",  icon: Settings,                       resource: "settings" },
  { path: "/team",            label: "Team",      icon: UserCog,       ownerOnly: true, resource: null },
  { path: "/mail",            label: "Mail",      icon: Mail,          ownerOnly: true, resource: null },
];

export default function Layout({ onLogout }) {
  const location = useLocation();
  const [engineRunning, setEngineRunning] = useState(true);
  const [driveConnected, setDriveConnected] = useState(true);
  const { role, permissions } = useUser();

  const visibleNav = NAV.filter(nav => {
    if (nav.ownerOnly) return role === "owner";
    if (role === "owner" || !permissions) return true;
    return permissions[nav.resource]?.view === true;
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const autoResp = await axios.get(`${API}/automation/status`);
        setEngineRunning(autoResp.data.scheduler_running);
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkDrive = async () => {
      try {
        const resp = await axios.get(`${API}/auth/google/status`);
        setDriveConnected(resp.data.connected);
      } catch {}
    };
    checkDrive();
    const interval = setInterval(checkDrive, 60000);
    return () => clearInterval(interval);
  }, []);

  const isActive = (nav) => {
    if (nav.exact) return location.pathname === nav.path;
    return location.pathname.startsWith(nav.path);
  };

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-zinc-800">
          <img src={logo} alt="Sleeping Creators" className="w-7 h-7 rounded" />
          <div>
            <div className="text-sm font-bold tracking-tight text-white">Sleeping Creators</div>
            <div className="text-[10px] text-zinc-500 font-mono">CONTENT ENGINE</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          {visibleNav.map((nav) => {
            const Icon = nav.icon;
            const active = isActive(nav);
            return (
              <NavLink
                key={nav.path}
                to={nav.path}
                data-testid={`nav-${nav.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-white text-black font-semibold"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Icon size={15} />
                <span>{nav.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Engine Status + Logout */}
        <div className="p-3 border-t border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800">
            <Circle
              size={7}
              className={`fill-current ${engineRunning ? "text-emerald-400 animate-pulse" : "text-red-500"}`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono text-zinc-400">AUTOMATION ENGINE</div>
              <div className={`text-[11px] font-semibold ${engineRunning ? "text-emerald-400" : "text-red-400"}`}>
                {engineRunning ? "RUNNING" : "STOPPED"}
              </div>
            </div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-white hover:bg-zinc-800 text-xs font-mono transition-colors duration-150"
          >
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin flex flex-col">
        {!driveConnected && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-400 text-xs font-mono flex-shrink-0">
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span className="flex-1">Google Drive is disconnected — video clips and images cannot be downloaded.</span>
            <a
              href={`${process.env.REACT_APP_BACKEND_URL}/api/auth/google/start`}
              className="px-3 py-1 border border-amber-500/50 hover:border-amber-400 hover:text-amber-300 transition-colors duration-150 whitespace-nowrap"
            >
              Reconnect Drive
            </a>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
