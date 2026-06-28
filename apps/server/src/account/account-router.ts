import { Router } from "express";
import { requireSession } from "../middlewares/auth";
import { requireSameOrigin } from "../middlewares/csrf";
import { authLimiter } from "../middlewares/rate-limit";
import {
  addPasskeyOptions,
  deletePasskey,
  generateRecoveryCodes,
  getMe,
  listPasskeys,
  listSessions,
  logout,
  recoveryLogin,
  renamePasskey,
  revokeSession,
} from "./account";

export const accountRouter: Router = Router();

accountRouter.post("/account/recovery/login", authLimiter, requireSameOrigin, recoveryLogin);

accountRouter.get("/account/me", requireSession, getMe);
accountRouter.get("/account/passkeys", requireSession, listPasskeys);
accountRouter.post(
  "/account/passkeys/options",
  requireSession,
  requireSameOrigin,
  addPasskeyOptions,
);
accountRouter.patch("/account/passkeys/:id", requireSession, requireSameOrigin, renamePasskey);
accountRouter.delete("/account/passkeys/:id", requireSession, requireSameOrigin, deletePasskey);
accountRouter.get("/account/sessions", requireSession, listSessions);
accountRouter.delete("/account/sessions/:id", requireSession, requireSameOrigin, revokeSession);
accountRouter.post("/account/logout", requireSession, requireSameOrigin, logout);
accountRouter.post(
  "/account/recovery-codes",
  requireSession,
  requireSameOrigin,
  generateRecoveryCodes,
);
