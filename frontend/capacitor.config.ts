import type { CapacitorConfig } from '@capacitor/cli'

// The iPhone shell (AS-4.1, DEC-99). The web app is built into dist/ and runs inside a native WKWebView at
// capacitor://localhost, the one origin the backend's CORS allows (AS-3.4). The bundle ID cannot change after the
// first App Store Connect upload.
const config: CapacitorConfig = {
  appId: 'com.newpandaworld.legallens',
  appName: 'LegalLens',
  webDir: 'dist',
  // Safe areas are handled in the page's CSS (viewport-fit=cover); contentInset does nothing for a page that does not scroll.
  ios: { backgroundColor: '#FBFBFA' },
  // The page shrinks to what is above the keyboard, so the field being typed in and the composer stay visible.
  plugins: { Keyboard: { resize: 'native' } },
}

export default config
