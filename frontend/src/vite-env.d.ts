/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional: when unset (or empty) the API client falls back to a relative base so
   * Vite's dev proxy and same-origin deployments work with no configuration.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
