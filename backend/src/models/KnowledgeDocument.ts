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
  Default
} from "sequelize-typescript";
import Company from "./Company";
import KnowledgeBase from "./KnowledgeBase";
import KnowledgeChunk from "./KnowledgeChunk";

@Table
class KnowledgeDocument extends Model<KnowledgeDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => KnowledgeBase)
  @Column
  knowledgeBaseId: number;

  @BelongsTo(() => KnowledgeBase)
  knowledgeBase: KnowledgeBase;

  @Column
  title: string;

  @Default("text")
  @Column
  type: string;

  @Column
  originalFilename: string;

  @Column
  storageUrl: string;

  @Default("pending")
  @Column
  status: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => KnowledgeChunk)
  chunks: KnowledgeChunk[];
}

export default KnowledgeDocument;
