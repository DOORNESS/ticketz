/**
 * Idempotent backfill — maps KnowledgeDocuments → KnowledgeAssets (§12.2)
 * Run: cd backend && npx ts-node --transpile-only src/scripts/backfillKnowledgeAssets.ts
 */
import { Op } from "sequelize";
import crypto from "crypto";
import "../bootstrap";
import sequelize from "../database";
import Company from "../models/Company";
import KnowledgeBase from "../models/KnowledgeBase";
import KnowledgeDomain from "../models/KnowledgeDomain";
import KnowledgeDocument from "../models/KnowledgeDocument";
import KnowledgeChunk from "../models/KnowledgeChunk";
import KnowledgeAsset from "../models/KnowledgeAsset";
import KnowledgeAssetVersion from "../models/KnowledgeAssetVersion";
import { slugify } from "../services/AiServices/KnowledgeCms/slugify";
import { GetCompanySetting } from "../helpers/CheckSettings";

type BackfillReport = {
  companyId: number;
  domainsUpserted: number;
  basesLinked: number;
  assetsUpserted: number;
  versionsUpserted: number;
  chunksUpdated: number;
  errors: string[];
};

const mapDocumentType = (type: string): string => {
  const normalized = type.toLowerCase();
  if (normalized === "docx") return "word";
  if (normalized === "md" || normalized === "markdown") return "markdown";
  if (["pdf", "text", "url", "faq", "word", "markdown"].includes(normalized)) {
    return normalized;
  }
  return "text";
};

const mapLifecycle = (status: string): string => {
  if (status === "ready") return "published";
  return "draft";
};

const mapIngestionStatus = (status: string): string => {
  if (status === "ready") return "indexed";
  if (status === "error") return "failed";
  return "pending";
};

export const backfillCompanyKnowledgeAssets = async (
  companyId: number
): Promise<BackfillReport> => {
  const report: BackfillReport = {
    companyId,
    domainsUpserted: 0,
    basesLinked: 0,
    assetsUpserted: 0,
    versionsUpserted: 0,
    chunksUpdated: 0,
    errors: []
  };

  const [domain] = await KnowledgeDomain.findOrCreate({
    where: { companyId, slug: "geral" },
    defaults: {
      companyId,
      slug: "geral",
      name: "Geral",
      description: "Domínio padrão migrado",
      sortOrder: 100,
      active: true,
      metadata: { origin: "backfill" }
    }
  });
  report.domainsUpserted += 1;

  const bases = await KnowledgeBase.findAll({
    where: { companyId, knowledgeDomainId: { [Op.is]: null } }
  });

  await Promise.all(
    bases.map(async base => {
      await base.update({ knowledgeDomainId: domain.id });
      report.basesLinked += 1;
    })
  );

  const embeddingModel =
    (await GetCompanySetting(companyId, "aiEmbeddingModel", "")) ||
    process.env.AI_EMBEDDING_MODEL ||
    "text-embedding-3-small";
  const embeddingProvider =
    (await GetCompanySetting(companyId, "aiEmbeddingProvider", "")) ||
    process.env.AI_EMBEDDING_PROVIDER ||
    "openai";

  const documents = await KnowledgeDocument.findAll({ where: { companyId } });

  await Promise.all(
    documents.map(async doc => {
      try {
        const documentBase = await KnowledgeBase.findOne({
          where: { id: doc.knowledgeBaseId, companyId }
        });
        const knowledgeDomainId = documentBase?.knowledgeDomainId || domain.id;
        const chunkCount = await KnowledgeChunk.count({
          where: { companyId, knowledgeDocumentId: doc.id }
        });

        const [asset, assetCreated] = await KnowledgeAsset.findOrCreate({
          where: { legacyDocumentId: doc.id },
          defaults: {
            companyId,
            knowledgeBaseId: doc.knowledgeBaseId,
            categoryId: null,
            assetType: mapDocumentType(doc.type) as KnowledgeAsset["assetType"],
            lifecycleStatus: mapLifecycle(
              doc.status
            ) as KnowledgeAsset["lifecycleStatus"],
            title: doc.title,
            slug: slugify(`${doc.title}-${doc.id}`),
            summary: "",
            metadata:
              doc.status === "error"
                ? { migrationError: true, legacyStatus: doc.status }
                : { origin: "backfill" },
            legacyDocumentId: doc.id
          }
        });

        if (!assetCreated) {
          await asset.update({
            title: doc.title,
            knowledgeBaseId: doc.knowledgeBaseId,
            assetType: mapDocumentType(doc.type) as KnowledgeAsset["assetType"],
            lifecycleStatus: mapLifecycle(
              doc.status
            ) as KnowledgeAsset["lifecycleStatus"]
          });
        }
        report.assetsUpserted += 1;

        const [version, versionCreated] =
          await KnowledgeAssetVersion.findOrCreate({
            where: {
              companyId,
              knowledgeAssetId: asset.id,
              versionNumber: 1
            },
            defaults: {
              companyId,
              knowledgeAssetId: asset.id,
              versionNumber: 1,
              title: doc.title,
              storageUrl: doc.storageUrl || "",
              contentHash: crypto
                .createHash("sha256")
                .update(doc.storageUrl || String(doc.id))
                .digest("hex"),
              ingestionStatus: mapIngestionStatus(
                doc.status
              ) as KnowledgeAssetVersion["ingestionStatus"],
              chunkCount,
              chunkSize: 1800,
              chunkOverlap: 200,
              ingestionPipeline: "legacy-v0-migration",
              embeddingModel,
              embeddingProvider,
              errorMessage: doc.status === "error" ? "legacy_error" : null
            }
          });

        if (!versionCreated) {
          await version.update({
            storageUrl: doc.storageUrl || version.storageUrl,
            ingestionStatus: mapIngestionStatus(
              doc.status
            ) as KnowledgeAssetVersion["ingestionStatus"],
            chunkCount
          });
        }
        report.versionsUpserted += 1;

        await asset.update({
          currentVersionId: version.id,
          publishedVersionId:
            doc.status === "ready" ? version.id : asset.publishedVersionId
        });

        const [updatedChunks] = await KnowledgeChunk.update(
          {
            knowledgeAssetVersionId: version.id,
            knowledgeAssetId: asset.id,
            knowledgeBaseId: doc.knowledgeBaseId,
            knowledgeDomainId,
            lifecycleStatus: doc.status === "ready" ? "published" : "draft"
          },
          {
            where: { companyId, knowledgeDocumentId: doc.id }
          }
        );
        report.chunksUpdated += updatedChunks;
      } catch (error) {
        report.errors.push(
          `doc#${doc.id}: ${error instanceof Error ? error.message : "unknown"}`
        );
      }
    })
  );

  return report;
};

const run = async (): Promise<void> => {
  await sequelize.authenticate();

  const companyFilter = process.env.COMPANY_ID
    ? { id: Number(process.env.COMPANY_ID) }
    : {};

  const companies = await Company.findAll({ where: companyFilter });
  const reports = await Promise.all(
    companies.map(async company => {
      const docCount = await KnowledgeDocument.count({
        where: { companyId: company.id }
      });
      if (!docCount) {
        return null;
      }
      return backfillCompanyKnowledgeAssets(company.id);
    })
  ).then(items =>
    items.filter((item): item is BackfillReport => item !== null)
  );

  console.log("\n=== BACKFILL REPORT ===\n");
  reports.forEach(report => {
    console.log(JSON.stringify(report, null, 2));
  });

  const failed = reports.some(r => r.errors.length > 0);
  process.exit(failed ? 1 : 0);
};

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
