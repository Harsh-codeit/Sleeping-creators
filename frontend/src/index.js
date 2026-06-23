import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { initNative } from "@/lib/native";

// Initialize Capacitor native features (status bar, splash screen, back button)
// Safe to call on web — it's a no-op when not running in a native shell
initNative();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
