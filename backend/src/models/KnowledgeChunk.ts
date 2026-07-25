import {
  Table,
  Column,
  CreatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import KnowledgeDocument from "./KnowledgeDocument";
import KnowledgeAsset from "./KnowledgeAsset";
import KnowledgeAssetVersion from "./KnowledgeAssetVersion";
import KnowledgeBase from "./KnowledgeBase";
import KnowledgeDomain from "./KnowledgeDomain";
import KnowledgeCategory from "./KnowledgeCategory";

@Table({ updatedAt: false })
class KnowledgeChunk extends Model<KnowledgeChunk> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => KnowledgeDocument)
  @Column({ allowNull: true })
  knowledgeDocumentId: number;

  @BelongsTo(() => KnowledgeDocument)
  knowledgeDocument: KnowledgeDocument;

  @ForeignKey(() => KnowledgeAssetVersion)
  @Column
  knowledgeAssetVersionId: number;

  @BelongsTo(() => KnowledgeAssetVersion)
  knowledgeAssetVersion: KnowledgeAssetVersion;

  @ForeignKey(() => KnowledgeAsset)
  @Column
  knowledgeAssetId: number;

  @BelongsTo(() => KnowledgeAsset)
  knowledgeAsset: KnowledgeAsset;

  @ForeignKey(() => KnowledgeBase)
  @Column
  knowledgeBaseId: number;

  @ForeignKey(() => KnowledgeDomain)
  @Column
  knowledgeDomainId: number;

  @ForeignKey(() => KnowledgeCategory)
  @Column
  categoryId: number;

  @Column
  lifecycleStatus: string;

  @Column(DataType.TEXT)
  content: string;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;
}

export default KnowledgeChunk;
