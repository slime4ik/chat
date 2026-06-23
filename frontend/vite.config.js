import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy API / media / websocket to the Django backend so the frontend
// can use same-origin relative URLs (exactly like in production behind nginx).
const BACKEND = process.env.VITE_BACKEND_URL || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/media": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND, ws: true, changeOrigin: true },
    },
  },
});
