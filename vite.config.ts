import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

const target = process.env.CLUSTER_URL ?? "https://turingpi.local";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), svgr(), TanStackRouterVite(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // proxy api during development
      "/api": {
        target,
        changeOrigin: false,
        secure: false,
        // The serial console is a WebSocket under /api, and without this the
        // dev server answers its handshake itself with a 404 instead of
        // proxying it. Dev only; the BMC serves the UI and the daemon from
        // one origin, so nothing proxies anything in production.
        ws: true,
      },
    },
  },
});
