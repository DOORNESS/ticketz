import express from "express";
import * as EscalationEmailController from "../controllers/EscalationEmailController";

const escalationRoutes = express.Router();

escalationRoutes.get(
  "/escalation/:token",
  EscalationEmailController.showEscalationForm
);

escalationRoutes.post(
  "/escalation/:token",
  express.urlencoded({ extended: false, limit: "32kb" }),
  EscalationEmailController.submitEscalationForm
);

export default escalationRoutes;
