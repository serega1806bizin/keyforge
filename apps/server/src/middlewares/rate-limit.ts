import rateLimit from "express-rate-limit";
import { isDev } from "../config/env";

const WINDOW_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isDev,
});

export const dcrLimiter = rateLimit({
  windowMs: HOUR_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});
