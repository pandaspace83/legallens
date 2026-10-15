interface ImportMetaEnv {
  /** Which ApiClient the app uses: the in-browser mock (default) or the FastAPI backend (INT-0.3). */
  readonly VITE_API?: 'mock' | 'http'
}

/** The frontend's version from package.json, set at build time (vite.config.ts). */
declare const __APP_VERSION__: string
