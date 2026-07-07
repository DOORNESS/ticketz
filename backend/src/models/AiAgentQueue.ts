import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import AiAgent from "./AiAgent";
import Queue from "./Queue";
import KnowledgeBase from "./KnowledgeBase";

@Table
class AiAgentQueue extends Model<AiAgentQueue> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => AiAgent)
  @Column
  aiAgentId: number;

  @BelongsTo(() => AiAgent)
  aiAgent: AiAgent;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @ForeignKey(() => KnowledgeBase)
  @Column
  knowledgeBaseId: number;

  @BelongsTo(() => KnowledgeBase)
  knowledgeBase: KnowledgeBase;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiAgentQueue;
