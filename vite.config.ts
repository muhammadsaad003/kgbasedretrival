import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built `dist/` works from any sub-path (GitHub Pages, static hosts).
  base: "./",
  server: { port: 5173, open: false },
});
