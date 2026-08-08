import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import * as BrandController from "../controllers/BrandController";

const brandRoutes = Router();

/**
 * Seseletor global: qualquer usuário autenticado lista as marcas que ele
 * pode ver. A filtragem por permissão acontece no service, não aqui.
 */
brandRoutes.get("/brands", isAuth, BrandController.index);

// Administração de marcas e vínculo de funcionários.
brandRoutes.get("/brands/admin", isAuth, isAdmin, BrandController.adminIndex);
brandRoutes.post("/brands", isAuth, isAdmin, BrandController.store);
brandRoutes.put("/brands/:brandId", isAuth, isAdmin, BrandController.update);
brandRoutes.delete("/brands/:brandId", isAuth, isAdmin, BrandController.remove);
brandRoutes.post("/brands/backfill", isAuth, isAdmin, BrandController.backfill);

brandRoutes.get(
  "/users/:userId/brands",
  isAuth,
  isAdmin,
  BrandController.userBrands
);
brandRoutes.put(
  "/users/:userId/brands",
  isAuth,
  isAdmin,
  BrandController.setUserBrands
);

export default brandRoutes;
