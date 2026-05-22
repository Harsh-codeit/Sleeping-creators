import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "./components/ui/sonner";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Logs from "./pages/Logs";
import Carousel from "./pages/Carousel";
import CalendarPage from "./pages/CalendarPage";
import TemplateLibrary from "./pages/TemplateLibrary";
import TemplateBuilder from "./pages/TemplateBuilder";
import Onboarding from "./pages/Onboarding";
import InstagramCallback from "./pages/InstagramCallback";
import FacebookCallback from "./pages/FacebookCallback";
import GlobalLibrary from "./pages/GlobalLibrary";
import UsagePage from "./pages/UsagePage";
import MusicLibraryPage from "./pages/MusicLibraryPage";
import Login from "./pages/Login";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { UserProvider } from "./context/UserContext";
import { PermissionGate } from "./components/PermissionGate";
import TeamPage from "./pages/TeamPage";
import VideoTemplatesAdmin from "./pages/VideoTemplatesAdmin";

// Set axios auth header synchronously on load so it's ready before any
// child component fires an API call (useEffect would run too late).
const savedToken = localStorage.getItem("sc_token");
if (savedToken) {
  axios.defaults.headers.common["Authorization"] = `Bearer ${savedToken}`;
}

function App() {
  const [token, setToken] = useState(() => savedToken);

  // Keep axios Authorization header in sync with token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  // Global 401 interceptor → log out
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
        <Routes>
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/instagram/callback" element={<InstagramCallback />} />
          <Route path="/facebook/callback" element={<FacebookCallback />} />
          {token ? (
            <>
              <Route path="/" element={<Layout onLogout={handleLogout} />}>
                <Route index element={<Dashboard />} />
                <Route path="clients" element={<PermissionGate resource="clients"><Clients /></PermissionGate>} />
                <Route path="clients/:id" element={<PermissionGate resource="clients"><ClientDetail /></PermissionGate>} />
                <Route path="templates" element={<PermissionGate resource="templates"><TemplateLibrary /></PermissionGate>} />
                <Route path="templates/new" element={<PermissionGate resource="templates"><TemplateBuilder /></PermissionGate>} />
                <Route path="templates/:id/edit" element={<PermissionGate resource="templates"><TemplateBuilder /></PermissionGate>} />
                <Route path="templates/:id/clone" element={<PermissionGate resource="templates"><TemplateBuilder /></PermissionGate>} />
                <Route path="calendar" element={<PermissionGate resource="calendar"><CalendarPage /></PermissionGate>} />
                <Route path="analytics" element={<PermissionGate resource="analytics"><Analytics /></PermissionGate>} />
                <Route path="dropbox" element={<PermissionGate resource="dropbox"><GlobalLibrary /></PermissionGate>} />
                <Route path="settings" element={<PermissionGate resource="settings"><Settings /></PermissionGate>} />
                <Route path="logs" element={<PermissionGate resource="logs"><Logs /></PermissionGate>} />
                <Route path="usage" element={<PermissionGate resource="usage"><UsagePage /></PermissionGate>} />
                <Route path="carousel" element={<PermissionGate resource="studio"><Carousel /></PermissionGate>} />
                <Route path="music" element={<PermissionGate resource="music"><MusicLibraryPage /></PermissionGate>} />
                <Route path="video-templates" element={<PermissionGate resource="video_templates"><VideoTemplatesAdmin /></PermissionGate>} />
                <Route path="onboarding" element={<Onboarding />} />
                <Route path="team" element={<PermissionGate ownerOnly><TeamPage /></PermissionGate>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<Login onLogin={handleLogin} />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}

export default App;
