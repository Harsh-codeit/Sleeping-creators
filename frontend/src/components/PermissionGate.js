import { Navigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

export function PermissionGate({ resource, ownerOnly, children }) {
  const { role, permissions } = useUser();
  if (role === "owner") return children;
  if (ownerOnly) return <Navigate to="/" replace />;
  if (!resource) return children;
  if (!permissions || permissions[resource]?.view !== true) {
    return <Navigate to="/" replace />;
  }
  return children;
}
