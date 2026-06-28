import { Router } from "express";
import { requireSameOrigin } from "../middlewares/csrf";
import { authLimiter } from "../middlewares/rate-limit";
import { loginOptions, loginVerify } from "./authentication";
import { registerOptions, registerVerify } from "./registration";

export const webauthnRouter: Router = Router();

webauthnRouter.post("/webauthn/register/options", authLimiter, requireSameOrigin, registerOptions);
webauthnRouter.post("/webauthn/register/verify", authLimiter, requireSameOrigin, registerVerify);
webauthnRouter.post("/webauthn/login/options", authLimiter, requireSameOrigin, loginOptions);
webauthnRouter.post("/webauthn/login/verify", authLimiter, requireSameOrigin, loginVerify);
