import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs/promises";
import { componentTagger } from "lovable-tagger";

const ALLOWED_CSV_FILES = new Set([
  "Omnea Flow Meta Data.csv",
  "Omnea Tag Meta data.csv",
  "Omnea Logic and Condition.csv",
  "Omnea Block Structure.csv",
]);

function localCsvSavePlugin() {
  return {
    name: "local-csv-save-plugin",
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any) => void) => void } }) {
      server.middlewares.use("/__local_api/save-csv", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        let body = "";
        req.on("data", (chunk: Buffer | string) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const payload = JSON.parse(body) as { filename?: string; content?: string };
            const filename = payload.filename?.trim() ?? "";
            const content = payload.content ?? "";

            if (!ALLOWED_CSV_FILES.has(filename)) {
              res.statusCode = 400;
              res.end("Unsupported filename");
              return;
            }

            const outputPath = path.resolve(__dirname, "public", "doc", filename);
            await fs.writeFile(outputPath, content, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 500;
            res.end(error instanceof Error ? error.message : "Failed to save CSV");
          }
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: "https://api.omnea.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  plugins: [react(), localCsvSavePlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
