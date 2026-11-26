import { defineConfig, loadEnv } from "vite";
import { previewRunMiddleware } from "./scripts/preview-run.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["OPENAI_", "B2B_"]);
  const authPath = loadEnv(mode, process.cwd(), "VITE_AUTH_API_PATH").VITE_AUTH_API_PATH;
  const authProxy = authPath === "/api/auth"
    ? { "/api/auth": "https://b2b-backend-387a.onrender.com" }
    : undefined;
  const configure = (server) => {
    if (!authPath) previewRunMiddleware(server, env);
  };
  return {
    esbuild: { jsx: "automatic" },
    server: {
      proxy: authProxy,
      fs: {
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/googleAuthCredentials.json", "**/atlas-credentials.env", "**/B2B-backend/**"],
      },
    },
    preview: { proxy: authProxy },
    plugins: [{
      name: "preview-run",
      configureServer: configure,
    }],
  };
});
