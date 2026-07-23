import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// The guest camera is the one bundle that must stay tiny. See DESIGN.md
// non-negotiable #3 — no third-party requests, everything inlined or bundled.
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    // host:true (via --host) exposes the dev server on the LAN so a real phone
    // can open it. Real-device testing is a gate — CHECKLIST.md §11.
    proxy: {
      "/api": {
        target: process.env.API_BASE_URL ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2020",
    // Inline every asset below 8 KB so the capture page makes as few requests
    // as possible on a bad venue connection.
    assetsInlineLimit: 8192,
    reportCompressedSize: true,
  },
});
