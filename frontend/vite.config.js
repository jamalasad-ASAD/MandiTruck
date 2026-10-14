import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Frontend calls /api/... and Vite forwards to the Express backend.
      // Read the SAME API_PORT the backend uses (default 5000) so they never
      // drift apart — a mismatch here is the usual cause of a 500 on /api.
      "/api": {
        target: `http://localhost:${process.env.API_PORT || 5000}`,
        changeOrigin: true
      }
    }
  }
});
