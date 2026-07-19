import express from "express";
import isAuth from "../middleware/isAuth";

import * as TicketController from "../controllers/TicketController";
import * as TicketAiController from "../controllers/TicketAiController";
import * as AiLearningController from "../controllers/AiLearningController";
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

ticketRoutes.get(
  "/tickets/:ticketId/ai/copilot",
  isAuth,
  isCompliant,
  TicketAiController.copilot
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/copilot",
  isAuth,
  isCompliant,
  TicketAiController.copilot
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/copilot/action",
  isAuth,
  isCompliant,
  TicketAiController.copilotAction
);

ticketRoutes.get(
  "/tickets/:ticketId/ai/knowledge-suggestion",
  isAuth,
  isCompliant,
  TicketAiController.knowledgeSuggestion
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/knowledge-suggestion/approve",
  isAuth,
  isCompliant,
  TicketAiController.approveKnowledge
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/learning/draft",
  isAuth,
  isCompliant,
  AiLearningController.learningDraft
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/learning/similar-docs",
  isAuth,
  isCompliant,
  AiLearningController.learningSimilarDocs
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/learning/update-draft",
  isAuth,
  isCompliant,
  AiLearningController.learningUpdateDraft
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/learning/save",
  isAuth,
  isCompliant,
  AiLearningController.learningSave
);

ticketRoutes.post(
  "/tickets/:ticketId/ai/learning/decline",
  isAuth,
  isCompliant,
  AiLearningController.learningDecline
);

ticketRoutes.get(
  "/tickets/:ticketId/ai/learning",
  isAuth,
  isCompliant,
  AiLearningController.learningForTicket
);

ticketRoutes.get(
  "/tickets/:ticketId/ai/explainability",
  isAuth,
  isCompliant,
  AiLearningController.explainability
);

ticketRoutes.delete(
  "/tickets/:ticketId",
  isAuth,
  isCompliant,
  TicketController.remove
);

export default ticketRoutes;
