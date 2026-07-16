import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "ios" | "android" | "web"

export async function initNative() {
  if (!isNative) return;

  // Dark status bar
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#09090b" });
  } catch {}

  // Hide splash screen after a short delay
  try {
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {}

  // Handle Android hardware back button
  App.addListener("backButton", ({ canGoBack }) => {
    if (!canGoBack) App.exitApp();
    else window.history.back();
  });

  // When the user returns to the app (e.g. after OAuth in system browser),
  // fire a custom event so Settings and Onboarding can refresh connection status
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event("sc:app-resume"));
  });
}
