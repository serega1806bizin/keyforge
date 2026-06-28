import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class OAuthError extends Error {
  constructor(
    public error: string,
    public status = 400,
    public errorDescription?: string,
  ) {
    super(errorDescription ?? error);
    this.name = "OAuthError";
  }
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof OAuthError) {
    res.status(err.status).json({
      error: err.error,
      ...(err.errorDescription ? { error_description: err.errorDescription } : {}),
    });
    return;
  }
  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err }, "ApiError 5xx");
    res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "internal_server_error" });
}
