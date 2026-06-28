import { Router } from "express";
import { requireSameOrigin } from "../middlewares/csrf";
import { authLimiter, dcrLimiter } from "../middlewares/rate-limit";
import { handleAuthorize } from "./authorize";
import { handleRegister } from "./dcr";
import { completeInteractionStub, getInteraction, handleConsent } from "./interaction";
import { handleIntrospect } from "./introspection";
import { handleLogout } from "./logout";
import { handleRevoke } from "./revocation";
import { handleToken } from "./token";
import { handleUserInfo } from "./userinfo";

export const oidcRouter: Router = Router();

oidcRouter.get("/authorize", handleAuthorize);
oidcRouter.get("/interaction/:interactionId", getInteraction);
oidcRouter.post("/interaction/:interactionId/consent", requireSameOrigin, handleConsent);
oidcRouter.post("/interaction/:interactionId/complete", completeInteractionStub);
oidcRouter.post("/token", authLimiter, handleToken);
oidcRouter.get("/userinfo", handleUserInfo);

oidcRouter.post("/revoke", authLimiter, handleRevoke);
oidcRouter.post("/introspect", authLimiter, handleIntrospect);
oidcRouter.post("/register", dcrLimiter, handleRegister);
oidcRouter.get("/logout", handleLogout);
