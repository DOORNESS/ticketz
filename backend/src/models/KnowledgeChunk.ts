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
  @Column
  knowledgeDocumentId: number;

  @BelongsTo(() => KnowledgeDocument)
  knowledgeDocument: KnowledgeDocument;

  @Column(DataType.TEXT)
  content: string;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;
}

export default KnowledgeChunk;
