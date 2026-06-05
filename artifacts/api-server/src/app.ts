import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Resolve dashboard dist relative to this compiled file's location.
// In the bundle: artifacts/api-server/dist/index.mjs
// Dashboard is at: artifacts/dashboard/dist/public
// Using fileURLToPath for ESM compatibility; falls back to __dirname in CJS/banner context.
const _currentDir: string =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const dashboardDist = path.resolve(_currentDir, "../../dashboard/dist/public");

if (existsSync(dashboardDist)) {
  logger.info({ dashboardDist }, "Serving dashboard static files");
  app.use(express.static(dashboardDist));
  app.get(/(.*)/, (_req: Request, res: Response) => {
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
} else {
  logger.warn({ dashboardDist }, "Dashboard dist not found — serving API only");
  app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "api-server" });
  });
}

export default app;
