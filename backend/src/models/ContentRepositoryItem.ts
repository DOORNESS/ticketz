import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import KnowledgeDomain from "./KnowledgeDomain";
import KnowledgeBase from "./KnowledgeBase";
import KnowledgeAsset from "./KnowledgeAsset";
import ContentRepositoryItemVersion from "./ContentRepositoryItemVersion";

export type ContentRepositoryType =
  | "image"
  | "pdf"
  | "document"
  | "audio"
  | "video"
  | "link"
  | "text"
  | "location"
  | "file"
  | "message_template"
  | "internal_instruction";

@Table
class ContentRepositoryItem extends Model<ContentRepositoryItem> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column
  name: string;

  @Column
  displayTitle: string;

  @Column
  contentType: ContentRepositoryType;

  @Column
  category: string;

  @Column(DataType.TEXT)
  description: string;

  @Column(DataType.TEXT)
  sendCaption: string;

  @Column
  storageKey: string;

  @Column
  originalFileName: string;

  @Column
  fileSize: number;

  @Column
  mimeType: string;

  @Column
  thumbnailKey: string;

  @Column(DataType.TEXT)
  externalUrl: string;

  @Column(DataType.JSONB)
  tags: string[];

  @ForeignKey(() => KnowledgeDomain)
  @Column
  knowledgeDomainId: number;

  @BelongsTo(() => KnowledgeDomain)
  knowledgeDomain: KnowledgeDomain;

  @ForeignKey(() => KnowledgeBase)
  @Column
  knowledgeBaseId: number;

  @BelongsTo(() => KnowledgeBase)
  knowledgeBase: KnowledgeBase;

  @ForeignKey(() => KnowledgeAsset)
  @Column
  knowledgeAssetId: number;

  @BelongsTo(() => KnowledgeAsset)
  knowledgeAsset: KnowledgeAsset;

  @Column(DataType.JSONB)
  queueIds: number[];

  @Column(DataType.JSONB)
  agentIds: number[];

  @Column(DataType.JSONB)
  aiAgentIds: number[];

  @Default(true)
  @Column
  active: boolean;

  @Default(false)
  @Column
  allowAiUse: boolean;

  @Default(true)
  @Column
  allowHumanUse: boolean;

  @Default(false)
  @Column
  useForKnowledge: boolean;

  @Default(true)
  @Column
  useForDelivery: boolean;

  @Default("company")
  @Column
  visibility: string;

  @Default(0)
  @Column
  usageCount: number;

  @Column
  lastUsedAt: Date;

  @Default(1)
  @Column
  currentVersion: number;

  @Column
  checksum: string;

  @ForeignKey(() => User)
  @Column
  authorUserId: number;

  @BelongsTo(() => User, "authorUserId")
  author: User;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @Column
  archivedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => ContentRepositoryItemVersion)
  versions: ContentRepositoryItemVersion[];
}

export default ContentRepositoryItem;
