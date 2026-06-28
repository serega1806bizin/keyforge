import { Router } from "express";
import { requireAdmin } from "../middlewares/auth";
import { requireSameOrigin } from "../middlewares/csrf";
import { validateBody } from "../middlewares/validate";
import {
  ClientInput,
  ClientUpdateInput,
  createClient,
  deleteClient,
  getOneClient,
  listClients,
  listKeysHandler,
  rotateKeyHandler,
  updateClient,
} from "./admin";

export const adminRouter: Router = Router();

adminRouter.use("/admin", requireAdmin);

adminRouter.get("/admin/clients", listClients);
adminRouter.post("/admin/clients", requireSameOrigin, validateBody(ClientInput), createClient);
adminRouter.get("/admin/clients/:clientId", getOneClient);
adminRouter.patch(
  "/admin/clients/:clientId",
  requireSameOrigin,
  validateBody(ClientUpdateInput),
  updateClient,
);
adminRouter.delete("/admin/clients/:clientId", requireSameOrigin, deleteClient);
adminRouter.get("/admin/keys", listKeysHandler);
adminRouter.post("/admin/keys/rotate", requireSameOrigin, rotateKeyHandler);
