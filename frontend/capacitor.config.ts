import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sleepingcreators.app",
  appName: "Sleeping Creators",
  webDir: "build",
  ios: {
    contentInset: "always",
    backgroundColor: "#0d0d0d",
    scrollEnabled: false,
  },
  android: {
    backgroundColor: "#0d0d0d",
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0d0d0d",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#0d0d0d",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
