import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import isAdmin from "../middleware/isAdmin";
import { requireAiPlatformReady } from "../middleware/requireAiPlatformReady";
import * as AiAgentController from "../controllers/AiAgentController";
import * as KnowledgeBaseController from "../controllers/KnowledgeBaseController";
import * as KnowledgeDocumentController from "../controllers/KnowledgeDocumentController";
import * as KnowledgeDomainController from "../controllers/KnowledgeDomainController";
import * as KnowledgeCategoryController from "../controllers/KnowledgeCategoryController";
import * as KnowledgeAssetController from "../controllers/KnowledgeAssetController";
import * as AiLogController from "../controllers/AiLogController";
import * as AiHealthController from "../controllers/AiHealthController";
import * as AiDiagnosticsController from "../controllers/AiDiagnosticsController";
import * as AiResetController from "../controllers/AiResetController";
import * as AiSetupController from "../controllers/AiSetupController";
import * as AiPlaygroundController from "../controllers/AiPlaygroundController";
import * as AiDashboardController from "../controllers/AiDashboardController";
import * as AiLearningController from "../controllers/AiLearningController";
import * as AiOrchestratorController from "../controllers/AiOrchestratorController";
import * as ContactAiMemoryController from "../controllers/ContactAiMemoryController";
import * as AiToolController from "../controllers/AiToolController";
import * as ContentRepositoryController from "../controllers/ContentRepositoryController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const aiRoutes = Router();

aiRoutes.use(isAuth, isAdmin);

aiRoutes.get("/ai/health", AiHealthController.health);
aiRoutes.get("/ai/diagnostics", AiDiagnosticsController.index);
aiRoutes.post("/ai/reset-environment", AiResetController.resetEnvironment);
aiRoutes.post("/ai/wipe-customer-base", AiResetController.wipeCustomerBase);
aiRoutes.post("/ai/diagnostics/run", AiDiagnosticsController.run);
aiRoutes.get("/ai/setup/status", AiSetupController.status);

aiRoutes.get("/ai/agents", AiAgentController.index);
aiRoutes.get("/ai/orchestrator/status", AiAgentController.orchestratorStatus);
aiRoutes.get("/ai/knowledge-domains", KnowledgeDomainController.index);
aiRoutes.get("/ai/knowledge-bases", KnowledgeBaseController.index);
aiRoutes.get("/ai/documents", KnowledgeDocumentController.index);
aiRoutes.get("/ai/logs", AiLogController.index);
aiRoutes.get("/ai/dashboard", AiDashboardController.index);

aiRoutes.get("/ai/learnings", AiLearningController.indexLearnings);
aiRoutes.put(
  "/ai/learnings/:learningId",
  AiLearningController.editLearningAction
);
aiRoutes.post(
  "/ai/learnings/:learningId/approve",
  AiLearningController.approveLearningAction
);
aiRoutes.post(
  "/ai/learnings/:learningId/reject",
  AiLearningController.rejectLearningAction
);
aiRoutes.post(
  "/ai/learnings/:learningId/incorporate",
  AiLearningController.incorporateLearningAction
);

aiRoutes.get("/ai/replay", AiLearningController.replayIndex);
aiRoutes.get("/ai/replay/:replayId", AiLearningController.replayShow);

aiRoutes.use(requireAiPlatformReady);

aiRoutes.post("/ai/setup/demo", AiSetupController.createDemo);
aiRoutes.post("/ai/agents", AiAgentController.store);
aiRoutes.put("/ai/agents/:agentId", AiAgentController.update);
aiRoutes.delete("/ai/agents/:agentId", AiAgentController.remove);

aiRoutes.post("/ai/knowledge-domains", KnowledgeDomainController.store);
aiRoutes.put("/ai/knowledge-domains/:id", KnowledgeDomainController.update);

aiRoutes.post("/ai/knowledge-bases", KnowledgeBaseController.store);
aiRoutes.put("/ai/knowledge-bases/:baseId", KnowledgeBaseController.update);
aiRoutes.delete("/ai/knowledge-bases/:baseId", KnowledgeBaseController.remove);

aiRoutes.get(
  "/ai/knowledge-bases/:baseId/categories",
  KnowledgeCategoryController.indexByBase
);
aiRoutes.post("/ai/categories", KnowledgeCategoryController.store);
aiRoutes.put("/ai/categories/:id", KnowledgeCategoryController.update);
aiRoutes.delete("/ai/categories/:id", KnowledgeCategoryController.remove);

aiRoutes.get("/ai/assets", KnowledgeAssetController.index);
aiRoutes.post("/ai/assets", KnowledgeAssetController.store);
aiRoutes.get("/ai/assets/:assetId", KnowledgeAssetController.show);
aiRoutes.put("/ai/assets/:assetId", KnowledgeAssetController.update);
aiRoutes.post(
  "/ai/assets/:assetId/versions",
  KnowledgeAssetController.storeVersion
);
aiRoutes.get(
  "/ai/assets/:assetId/versions",
  KnowledgeAssetController.listVersions
);
aiRoutes.post(
  "/ai/assets/:assetId/submit-review",
  KnowledgeAssetController.submitReview
);
aiRoutes.post("/ai/assets/:assetId/approve", KnowledgeAssetController.approve);
aiRoutes.post("/ai/assets/:assetId/publish", KnowledgeAssetController.publish);
aiRoutes.post("/ai/assets/:assetId/archive", KnowledgeAssetController.archive);
aiRoutes.post(
  "/ai/assets/:assetId/rollback",
  KnowledgeAssetController.rollback
);
aiRoutes.post("/ai/assets/:assetId/reindex", KnowledgeAssetController.reindex);
aiRoutes.post("/ai/assets/text", KnowledgeAssetController.storeText);
aiRoutes.post(
  "/ai/assets/upload",
  upload.single("file"),
  KnowledgeAssetController.storeUpload
);
aiRoutes.get(
  "/ai/assets/:assetId/ingestion-jobs",
  KnowledgeAssetController.ingestionJobs
);

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
aiRoutes.post("/ai/orchestrator/preview", AiOrchestratorController.preview);

aiRoutes.get("/ai/dashboard/timeseries", AiDashboardController.timeseries);
aiRoutes.get("/ai/dashboard/agents", AiDashboardController.agentMetrics);
aiRoutes.get("/ai/write-tools/status", AiToolController.writeToolsStatus);
aiRoutes.get("/ai/tools/status", AiToolController.toolsStatus);
aiRoutes.get("/ai/tools", AiToolController.listRegisteredTools);
aiRoutes.get("/ai/agents/:agentId/tools", AiToolController.listAgentTools);
aiRoutes.put("/ai/agents/:agentId/tools", AiToolController.updateAgentTools);
aiRoutes.get("/ai/contacts/:contactId/memory", ContactAiMemoryController.index);
aiRoutes.post(
  "/ai/contacts/:contactId/memory",
  ContactAiMemoryController.store
);
aiRoutes.patch(
  "/ai/contacts/:contactId/memory/:memoryId",
  ContactAiMemoryController.patch
);
aiRoutes.get(
  "/ai/contacts/:contactId/memory/export",
  ContactAiMemoryController.exportMemory
);
aiRoutes.delete(
  "/ai/contacts/:contactId/memory",
  ContactAiMemoryController.removeAll
);
aiRoutes.get("/ai/tool-executions", AiToolController.toolExecutions);

aiRoutes.get(
  "/ai/repository/categories",
  ContentRepositoryController.categoriesIndex
);
aiRoutes.post(
  "/ai/repository/categories",
  ContentRepositoryController.categoriesStore
);
aiRoutes.put(
  "/ai/repository/categories/:categoryId",
  ContentRepositoryController.categoriesUpdate
);
aiRoutes.delete(
  "/ai/repository/categories/:categoryId",
  ContentRepositoryController.categoriesRemove
);
aiRoutes.get("/ai/repository/favorites", ContentRepositoryController.favorites);
aiRoutes.get("/ai/repository/recent", ContentRepositoryController.recent);
aiRoutes.get("/ai/repository/popular", ContentRepositoryController.popular);
aiRoutes.get("/ai/repository", ContentRepositoryController.index);
aiRoutes.get(
  "/ai/repository/:itemId/versions/compare",
  ContentRepositoryController.versionsCompare
);
aiRoutes.get(
  "/ai/repository/:itemId/versions",
  ContentRepositoryController.versionsIndex
);
aiRoutes.post(
  "/ai/repository/:itemId/versions/restore",
  ContentRepositoryController.versionsRestore
);
aiRoutes.get(
  "/ai/repository/:itemId/knowledge",
  ContentRepositoryController.knowledgeStatus
);
aiRoutes.post(
  "/ai/repository/:itemId/knowledge/reprocess",
  ContentRepositoryController.knowledgeReprocess
);
aiRoutes.post(
  "/ai/repository/:itemId/knowledge/unlink",
  ContentRepositoryController.knowledgeUnlink
);
aiRoutes.get(
  "/ai/repository/:itemId/preview",
  ContentRepositoryController.preview
);
aiRoutes.get("/ai/repository/:itemId", ContentRepositoryController.show);
aiRoutes.post("/ai/repository", ContentRepositoryController.store);
aiRoutes.post(
  "/ai/repository/upload",
  upload.single("file"),
  ContentRepositoryController.storeUpload
);
aiRoutes.put(
  "/ai/repository/:itemId",
  upload.single("file"),
  ContentRepositoryController.update
);
aiRoutes.delete("/ai/repository/:itemId", ContentRepositoryController.remove);
aiRoutes.post(
  "/ai/repository/:itemId/favorite",
  ContentRepositoryController.favorite
);

export default aiRoutes;
