import { pino } from "pino";
import { isDev } from "../config/env";

export const logger = pino({
  level: isDev ? "debug" : "info",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
    censor: "[redacted]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : {}),
});
