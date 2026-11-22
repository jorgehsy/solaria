import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const serverPort = Number(process.env.PORT ?? 4747);

// `pnpm dev`: Vite on its own port, proxying /api to the Solaria server (ADR 0004).
export default defineConfig({
  plugins: [react()],
  // PixiJS alone is ~500 kB; one chunk is fine for a local tool.
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${serverPort}` },
  },
  preview: { host: "127.0.0.1" },
});
