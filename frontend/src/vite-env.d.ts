/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional: when unset (or empty) the API client falls back to a relative base so
   * Vite's dev proxy and same-origin deployments work with no configuration.
   */
  readonly VITE_API_BASE_URL?: string;

  /**
   * Credentials of the shared read-only demo account. When both are set, the sign-in page
   * offers a "Browse as a guest" button that signs in with them.
   *
   * The password ships in the bundle, which is the intent: it is handed to every visitor,
   * and the backend refuses all writes from this one account (`GUEST_EMAIL`, see
   * `app/core/guest.py`), so it grants nothing a stranger couldn't already do. Never point
   * these at an account that owns real data.
   */
  readonly VITE_GUEST_EMAIL?: string;
  readonly VITE_GUEST_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
