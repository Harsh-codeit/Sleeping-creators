import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "./components/ui/sonner";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Carousel from "./pages/Carousel";
import CalendarPage from "./pages/CalendarPage";
import TemplateLibrary from "./pages/TemplateLibrary";
import TemplateBuilder from "./pages/TemplateBuilder";
import VideoTemplateBuilder from "./pages/VideoTemplateBuilder";
import UserOnboarding from "./pages/UserOnboarding";
import InstagramCallback from "./pages/InstagramCallback";
import BundleConnected from "./pages/BundleConnected";
import BundleConnect from "./pages/BundleConnect";
import FacebookCallback from "./pages/FacebookCallback";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import HookLibrary from "./pages/HookLibrary";
import CreatePost from "./pages/CreatePost";
import DraftsPage from "./pages/DraftsPage";
import { UserProvider, useUser } from "./context/UserContext";

const savedToken = localStorage.getItem("sc_token");
if (savedToken) {
  axios.defaults.headers.common["Authorization"] = `Bearer ${savedToken}`;
}

// Inner component sits inside UserProvider so it can call useUser()
function AppRoutes({ token, onLogin, onLogout }) {
  const user = useUser();

  // While we have a token but user hasn't loaded yet, show nothing to avoid flash
  if (token && !user?.role) return null;

  const needsOnboarding =
    token && user?.role === "user" && user?.onboarding_complete === false;

  return (
    <Routes>
      {/* Always-public routes */}
      <Route path="/privacy-policy"         element={<PrivacyPolicy />} />
      <Route path="/terms-of-service"       element={<TermsOfService />} />
      <Route path="/instagram/callback"     element={<InstagramCallback />} />
      <Route path="/facebook/callback"      element={<FacebookCallback />} />
      <Route path="/bundle-connected"       element={<BundleConnected />} />
      <Route path="/bundle-connect/:clientId" element={<BundleConnect />} />

      {token ? (
        <>
          {needsOnboarding ? (
            <>
              <Route path="/onboarding" element={<UserOnboarding />} />
              <Route path="*"           element={<Navigate to="/onboarding" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Layout onLogout={onLogout} />}>
                <Route index             element={<Dashboard />} />
                <Route path="create"     element={<CreatePost />} />
                <Route path="carousel"   element={<Carousel />} />
                <Route path="templates"                    element={<TemplateLibrary />} />
                <Route path="templates/new"              element={<TemplateBuilder />} />
                <Route path="templates/:id/edit"         element={<TemplateBuilder />} />
                <Route path="templates/:id/clone"        element={<TemplateBuilder />} />
                <Route path="templates/video/new"        element={<VideoTemplateBuilder />} />
                <Route path="templates/video/:id/edit"   element={<VideoTemplateBuilder />} />
                <Route path="calendar"   element={<CalendarPage />} />
                <Route path="analytics"  element={<Analytics />} />
                <Route path="settings"   element={<Settings onLogout={onLogout} />} />
                <Route path="hook-library" element={<HookLibrary />} />
                <Route path="drafts"     element={<DraftsPage />} />
                <Route path="onboarding" element={<Navigate to="/" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </>
      ) : (
        <>
          <Route path="/login"  element={<Login  onLogin={onLogin} />} />
          <Route path="/signup" element={<Signup onLogin={onLogin} />} />
          <Route path="*"       element={<Navigate to="/login" replace />} />
        </>
      )}
    </Routes>
  );
}

export default function App() {
  const [token, setToken] = useState(() => savedToken);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  useEffect(() => {
    const id = axios.interceptors.response.use(
      r => r,
      err => {
        if (err.response?.status === 401 && !err.config?.url?.includes("/auth/")) {
          localStorage.removeItem("sc_token");
          setToken(null);
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

  const handleLogin = t => {
    localStorage.setItem("sc_token", t);
    setToken(t);
    axios.defaults.headers.common["Authorization"] = `Bearer ${t}`;
  };

  const handleLogout = () => {
    localStorage.removeItem("sc_token");
    setToken(null);
  };

  return (
    <UserProvider token={token}>
      <BrowserRouter>
        <Toaster richColors position="top-right" />
        <AppRoutes token={token} onLogin={handleLogin} onLogout={handleLogout} />
      </BrowserRouter>
    </UserProvider>
  );
}
