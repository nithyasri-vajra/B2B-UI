import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { previewRunMiddleware } from "./scripts/preview-run.js";

const validator = fileURLToPath(new URL("./scripts/validate_brief.py", import.meta.url));
const maxBytes = 5 * 1024 * 1024;

function briefValidationMiddleware(server) {
  server.middlewares.use("/__preview/validate-brief", async (request, response) => {
    function send(status, data) {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(data));
    }

    if (request.method !== "POST") return send(405, { message: "Use POST." });
    const client = new URL(request.url, "http://localhost").searchParams.get("client");
    if (!client || client.length > 200) return send(400, { message: "Select a client." });
    if (request.headers["content-type"] !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      return send(415, { message: "Choose an .xlsx workbook." });
    }

    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxBytes) {
          request.resume();
          return send(413, { message: "Choose an .xlsx workbook no larger than 5 MB." });
        }
        chunks.push(chunk);
      }

      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.env.B2B_PYTHON || "python", [validator, client], {
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 10000,
          windowsHide: true,
        });
        let output = "";
        child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
        child.on("error", reject);
        child.stdin.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve(output);
          else reject(new Error("Excel validator failed."));
        });
        child.stdin.end(Buffer.concat(chunks));
      });
      send(200, JSON.parse(result));
    } catch {
      send(503, { message: "Excel validation is unavailable. The preview needs Python with openpyxl installed." });
    }
  });
}

export default defineConfig({
  esbuild: { jsx: "automatic" },
  plugins: [{
    name: "preview-brief-validation",
    configureServer(server) {
      briefValidationMiddleware(server);
      previewRunMiddleware(server);
    },
    configurePreviewServer(server) {
      briefValidationMiddleware(server);
      previewRunMiddleware(server);
    },
  }],
});
