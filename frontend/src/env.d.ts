interface ImportMetaEnv {
  /** Which ApiClient the app uses: the in-browser mock (default) or the FastAPI backend (INT-0.3). */
  readonly VITE_API?: 'mock' | 'http'
  /** Where the backend lives when it is not on the page's own origin, e.g. `https://api.example.com` (AS-3.1).
   *  Unset means same-origin, which is how the web build and the Docker image work. */
  readonly VITE_API_BASE?: string
}

/** The frontend's version from package.json, set at build time (vite.config.ts). */
declare const __APP_VERSION__: string
