import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sleepingcreators.app",
  appName: "Sleeping Creators",
  webDir: "build",
  ios: {
    contentInset: "always",
    backgroundColor: "#f5f4fb",
    scrollEnabled: false,
  },
  android: {
    backgroundColor: "#f5f4fb",
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#f5f4fb",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "Light",
      backgroundColor: "#ffffff",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
