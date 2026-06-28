import type { NextFunction, Request, Response } from "express";
import type { Session, User } from "../generated/prisma/client";
import { getSession } from "../session/session-service";
import { ApiError } from "./error";

export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authenticated = await getSession(req);
  if (!authenticated) {
    next(new ApiError(401, "authentication required"));
    return;
  }
  res.locals["session"] = authenticated.session;
  res.locals["user"] = authenticated.user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authenticated = await getSession(req);
  if (!authenticated) {
    next(new ApiError(401, "authentication required"));
    return;
  }
  if (authenticated.user.role !== "ADMIN") {
    next(new ApiError(403, "admin access required"));
    return;
  }
  res.locals["session"] = authenticated.session;
  res.locals["user"] = authenticated.user;
  next();
}

export function sessionUser(res: Response): User {
  return res.locals["user"] as User;
}

export function sessionRow(res: Response): Session {
  return res.locals["session"] as Session;
}
