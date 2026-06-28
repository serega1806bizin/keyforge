import type { Request, Response } from "express";
import { authenticateClient } from "../clients/client-auth";
import { audit } from "../lib/audit";
import { sha256 } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import type { FormBody } from "../lib/types";

export async function handleRevoke(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as FormBody;
  const client = await authenticateClient(req, body);
  const token = body["token"];

  if (token) {
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (row && row.clientId === client.clientId && !row.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit("token.revoke", {
        userId: row.userId,
        clientId: client.clientId,
        metadata: { familyId: row.familyId },
      });
    }
  }
  res.status(200).end();
}
