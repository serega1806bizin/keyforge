
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { accountRouter } from "./account/account-router";
import { adminRouter } from "./admin/admin-router";
import { errorHandler, notFound } from "./middlewares/error";
import { globalLimiter } from "./middlewares/rate-limit";
import { oidcRouter } from "./oidc/router";
import { healthRouter } from "./routes/health.routes";
import { wellKnownRouter } from "./routes/well-known.routes";
import { webauthnRouter } from "./webauthn/router";

const API_PREFIXES = [
  "/authorize",
  "/token",
  "/userinfo",
  "/revoke",
  "/introspect",
  "/register",
  "/logout",
  "/webauthn",
  "/interaction",
  "/account",
  "/admin",
  "/.well-known",
  "/healthz",
  "/readyz",
];

function serveWeb(app: Express): void {
  const webDist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  const indexHtml = path.join(webDist, "index.html");
  app.use(express.static(webDist));
  app.get(/.*/, (req, res, next) => {
    if (API_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
}

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", 1);

  app.use(pinoHttp({ logger }));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "https:"],
          "font-src": ["'self'"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'self'"],
          "form-action": ["'self'"],
          "object-src": ["'none'"],
          "upgrade-insecure-requests": null,
        },
      },
    }),
  );
  app.use(cors({ origin: env.RP_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(globalLimiter);

  app.use(wellKnownRouter);
  app.use(healthRouter);
  app.use(oidcRouter);
  app.use(webauthnRouter);
  app.use(accountRouter);
  app.use(adminRouter);

  if (env.SERVE_WEB) serveWeb(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
