import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import { requireAiPlatformReady } from "../middleware/requireAiPlatformReady";
import * as AiAgentController from "../controllers/AiAgentController";
import * as KnowledgeBaseController from "../controllers/KnowledgeBaseController";
import * as KnowledgeDocumentController from "../controllers/KnowledgeDocumentController";
import * as AiLogController from "../controllers/AiLogController";
import * as AiHealthController from "../controllers/AiHealthController";
import * as AiDiagnosticsController from "../controllers/AiDiagnosticsController";
import * as AiSetupController from "../controllers/AiSetupController";
import * as AiPlaygroundController from "../controllers/AiPlaygroundController";
import * as AiDashboardController from "../controllers/AiDashboardController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const aiRoutes = Router();

aiRoutes.use(isAuth, isAdmin);

aiRoutes.get("/ai/health", AiHealthController.health);
aiRoutes.get("/ai/diagnostics", AiDiagnosticsController.index);
aiRoutes.post("/ai/diagnostics/run", AiDiagnosticsController.run);
aiRoutes.get("/ai/setup/status", AiSetupController.status);

aiRoutes.get("/ai/agents", AiAgentController.index);
aiRoutes.get("/ai/knowledge-bases", KnowledgeBaseController.index);
aiRoutes.get("/ai/documents", KnowledgeDocumentController.index);
aiRoutes.get("/ai/logs", AiLogController.index);
aiRoutes.get("/ai/dashboard", AiDashboardController.index);

aiRoutes.use(requireAiPlatformReady);

aiRoutes.post("/ai/setup/demo", AiSetupController.createDemo);
aiRoutes.post("/ai/agents", AiAgentController.store);
aiRoutes.put("/ai/agents/:agentId", AiAgentController.update);
aiRoutes.delete("/ai/agents/:agentId", AiAgentController.remove);

aiRoutes.post("/ai/knowledge-bases", KnowledgeBaseController.store);
aiRoutes.put("/ai/knowledge-bases/:baseId", KnowledgeBaseController.update);
aiRoutes.delete("/ai/knowledge-bases/:baseId", KnowledgeBaseController.remove);

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

aiRoutes.post("/ai/playground", AiPlaygroundController.query);

export default aiRoutes;
