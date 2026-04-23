import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // Forward /api/* to the local dev server (or a deployed Lambda URL).
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      // In production, /content/* and /users/* are served directly from S3 via
      // CloudFront. Locally, the dev server proxies them to S3.
      "/content": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/users": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: "dist/spa",
    sourcemap: true,
  },
});
