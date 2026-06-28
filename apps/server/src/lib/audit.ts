import { Prisma } from "../generated/prisma/client";
import { logger } from "./logger";
import { prisma } from "./prisma";

export async function audit(
  event: string,
  opts: {
    userId?: string;
    clientId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event,
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.clientId ? { clientId: opts.clientId } : {}),
        ...(opts.ip ? { ip: opts.ip } : {}),
        ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
        ...(opts.metadata ? { metadata: opts.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (err) {
    logger.warn({ err, event }, "audit write failed");
  }
}
