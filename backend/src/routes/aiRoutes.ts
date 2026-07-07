import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import * as AiAgentController from "../controllers/AiAgentController";
import * as KnowledgeBaseController from "../controllers/KnowledgeBaseController";
import * as KnowledgeDocumentController from "../controllers/KnowledgeDocumentController";
import * as AiLogController from "../controllers/AiLogController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const aiRoutes = Router();

aiRoutes.use(isAuth, isAdmin);

aiRoutes.get("/ai/agents", AiAgentController.index);
aiRoutes.post("/ai/agents", AiAgentController.store);
aiRoutes.put("/ai/agents/:agentId", AiAgentController.update);
aiRoutes.delete("/ai/agents/:agentId", AiAgentController.remove);

aiRoutes.get("/ai/knowledge-bases", KnowledgeBaseController.index);
aiRoutes.post("/ai/knowledge-bases", KnowledgeBaseController.store);
aiRoutes.put("/ai/knowledge-bases/:baseId", KnowledgeBaseController.update);
aiRoutes.delete("/ai/knowledge-bases/:baseId", KnowledgeBaseController.remove);

aiRoutes.get("/ai/documents", KnowledgeDocumentController.index);
aiRoutes.post("/ai/documents/text", KnowledgeDocumentController.storeText);
aiRoutes.post(
  "/ai/documents/upload",
  upload.single("file"),
  KnowledgeDocumentController.storeFile
);
aiRoutes.post(
  "/ai/documents/:documentId/reprocess",
  KnowledgeDocumentController.reprocess
);
aiRoutes.delete(
  "/ai/documents/:documentId",
  KnowledgeDocumentController.remove
);

aiRoutes.get("/ai/logs", AiLogController.index);

export default aiRoutes;
