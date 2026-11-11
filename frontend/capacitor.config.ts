import type { CapacitorConfig } from '@capacitor/cli'

// The iPhone shell (AS-4.1, DEC-99). The web app is built into dist/ and runs inside a native WKWebView at
// capacitor://localhost, the one origin the backend's CORS allows (AS-3.4). The bundle ID cannot change after the
// first App Store Connect upload.
const config: CapacitorConfig = {
  appId: 'com.newpandaworld.legallens',
  appName: 'LegalLens',
  webDir: 'dist',
}

export default config
