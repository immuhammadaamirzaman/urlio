import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SPA talks to the FastAPI backend over CORS using a Bearer token, so no proxy is
// strictly required. We still proxy `/api` in dev as a convenience: it lets the frontend
// call same-origin paths and sidesteps any CORS/credentials edge cases while developing.
// Set VITE_API_BASE_URL to point the client at the backend directly instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
