import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { ApiError } from "./error";

export function requireSameOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  if (origin && origin !== env.RP_ORIGIN) {
    next(new ApiError(403, "cross-origin request rejected"));
    return;
  }
  next();
}
