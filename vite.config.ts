import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  // Tauri expects a fixed port in dev
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tell Vite to ignore watching src-tauri
      ignored: ["**/src-tauri/**"],
    },
  },
  // PDF.js needs the worker to be available as a static asset
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  build: {
    // Tauri uses ES modules
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ["pdfjs-dist"],
          pdflib: ["pdf-lib"],
        },
      },
    },
  },
});
