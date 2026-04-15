import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Starting AgriFuse server...");
  try {
    const app = express();
    const PORT = 3000;

    // API routes
    app.get("/api/health", (req, res) => {
      res.json({ status: "ok", message: "AgriFuse Core Intelligence Engine is online." });
    });

    console.log(`Environment: ${process.env.NODE_ENV}`);

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      console.log("Initializing Vite in middleware mode...");
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          host: '0.0.0.0',
          port: 3000,
          hmr: false // Disable HMR for stability in this environment
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached.");
    } else {
      console.log("Running in production mode...");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`AgriFuse Server successfully running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
