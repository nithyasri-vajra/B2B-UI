import { defineConfig, loadEnv } from "vite";
import { previewRunMiddleware } from "./scripts/preview-run.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["OPENAI_", "B2B_"]);
  const configure = (server) => { previewRunMiddleware(server, env); };
  return {
    esbuild: { jsx: "automatic" },
    plugins: [{
      name: "preview-run",
      configureServer: configure,
      configurePreviewServer: configure,
    }],
  };
});
