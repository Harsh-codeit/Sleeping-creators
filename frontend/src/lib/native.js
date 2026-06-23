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
}
