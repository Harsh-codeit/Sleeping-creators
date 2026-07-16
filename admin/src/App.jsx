import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Login from "./pages/Login.jsx";
import AdminLayout from "./components/AdminLayout.jsx";
import Overview from "./pages/Overview.jsx";
import Users from "./pages/Users.jsx";
import UserDetail from "./pages/UserDetail.jsx";
import Hooks from "./pages/Hooks.jsx";
import TokenUsage from "./pages/TokenUsage.jsx";
import PerformanceLibrary from "./pages/PerformanceLibrary.jsx";

function RequireAuth({ children }) {
  const token = localStorage.getItem("sc_admin_token");
  return token ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster theme="dark" position="top-right" />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route path="/overview"       element={<Overview />} />
          <Route path="/users"          element={<Users />} />
          <Route path="/users/:userId"  element={<UserDetail />} />
          <Route path="/hooks"          element={<Hooks />} />
          <Route path="/tokens"               element={<TokenUsage />} />
          <Route path="/performance-library" element={<PerformanceLibrary />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
