import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = process.env["IDP_URL"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    port: 5173,
    host: true,
    watch: { ignored: ["**/e2e/**", "**/test-results/**", "**/.playwright-results/**"] },
    proxy: {
      "/webauthn": API,
      "/interaction": API,
      "/authorize": API,
      "/token": API,
      "/userinfo": API,
      "/account": API,
      "/admin": API,
      "/.well-known": API,
    },
  },
});
