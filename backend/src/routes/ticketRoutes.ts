import express from "express";
import isAuth from "../middleware/isAuth";

import * as TicketController from "../controllers/TicketController";
import * as TicketAiController from "../controllers/TicketAiController";
import isCompliant from "../middleware/isCompliant";

const ticketRoutes = express.Router();

ticketRoutes.get("/tickets", isAuth, isCompliant, TicketController.index);

ticketRoutes.get(
  "/tickets/:ticketId",
  isAuth,
  isCompliant,
  TicketController.show
);

ticketRoutes.get(
  "/tickets/u/:uuid",
  isAuth,
  isCompliant,
  TicketController.showFromUUID
);

ticketRoutes.post("/tickets", isAuth, isCompliant, TicketController.store);

ticketRoutes.put(
  "/tickets/:ticketId",
  isAuth,
  isCompliant,
  TicketController.update
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/assume",
  isAuth,
  isCompliant,
  TicketAiController.assume
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/pause",
  isAuth,
  isCompliant,
  TicketAiController.pause
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/resume",
  isAuth,
  isCompliant,
  TicketAiController.resume
);

ticketRoutes.delete(
  "/tickets/:ticketId",
  isAuth,
  isCompliant,
  TicketController.remove
);

export default ticketRoutes;
