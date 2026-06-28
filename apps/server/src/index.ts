import { createApp } from "./app";
import { env } from "./config/env";
import { ensureSigningKey } from "./keys/key-store";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";

function main(): void {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`keyforge server listening on :${env.PORT} (issuer ${env.ISSUER_URL})`);
    void ensureSigningKey()
      .then((kid) => logger.info({ kid }, "signing key ready"))
      .catch((err) => logger.error({ err }, "failed to ensure signing key"));
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
