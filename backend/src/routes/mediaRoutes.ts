import express from "express";
import isAuth from "../middleware/isAuth";
import isCompliant from "../middleware/isCompliant";
import * as MediaAccessController from "../controllers/MediaAccessController";

const mediaRoutes = express.Router();

mediaRoutes.get("/media/access/:token", MediaAccessController.accessByToken);

mediaRoutes.get(
  "/media/:mediaId/signed-url",
  isAuth,
  isCompliant,
  MediaAccessController.signedUrl
);

mediaRoutes.get(
  "/media/:mediaId/stream",
  isAuth,
  isCompliant,
  MediaAccessController.streamById
);

mediaRoutes.get(
  "/media/unavailable/:mediaId",
  MediaAccessController.unavailable
);

export default mediaRoutes;
