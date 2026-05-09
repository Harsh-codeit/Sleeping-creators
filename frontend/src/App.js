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
import MusicLibrary from "./pages/MusicLibrary";
import Login from "./pages/Login";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

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
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="templates" element={<TemplateLibrary />} />
              <Route path="templates/new" element={<TemplateBuilder />} />
              <Route path="templates/:id/edit" element={<TemplateBuilder />} />
              <Route path="templates/:id/clone" element={<TemplateBuilder />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="dropbox" element={<GlobalLibrary />} />
              <Route path="settings" element={<Settings />} />
              <Route path="logs" element={<Logs />} />
              <Route path="usage" element={<UsagePage />} />
              <Route path="carousel" element={<Carousel />} />
              <Route path="music" element={<MusicLibrary />} />
              <Route path="onboarding" element={<Onboarding />} />
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
  );
}

export default App;
