/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor’s typed config does not include orientation; this field documents the
 * contract with native projects and is copied into `capacitor.config.json` on sync.
 * iOS allowed orientations live in `ios/App/App/Info.plist` (`UISupportedInterfaceOrientations~iphone` / `~ipad`).
 */
type MahjCapacitorConfig = CapacitorConfig & {
  orientation?: 'landscape';
};

const config: MahjCapacitorConfig = {
  appId: 'com.jason.mahjlogic',
  appName: 'MahjLogic',
  webDir: 'dist',
  /** Matches the app shell so iOS/Android WebViews are not system white before CSS loads. */
  backgroundColor: '#1a1e24',
  orientation: 'landscape',
  ios: {
    /** Avoids WKWebView scroll view automatic safe-area insets (side “letterboxing”). */
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 250,
      backgroundColor: '#121419',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
