import { Router } from "express";
import { prisma } from "../lib/prisma";

export const healthRouter: Router = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "keyforge", ts: new Date().toISOString() });
});

healthRouter.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", db: "up" });
  } catch {
    res.status(503).json({ status: "not_ready", db: "down" });
  }
});
