import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "./error";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ApiError(400, "VALIDATION_ERROR", result.error.issues));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ApiError(400, "VALIDATION_ERROR", result.error.issues));
      return;
    }
    res.locals["query"] = result.data;
    next();
  };
}
