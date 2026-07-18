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
import Queue from "./Queue";
import AiAgentQueue from "./AiAgentQueue";
import AiAgentKnowledgeBase from "./AiAgentKnowledgeBase";

@Table
class AiAgent extends Model<AiAgent> {
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

  @Default(true)
  @Column
  active: boolean;

  @Default("openai")
  @Column
  provider: string;

  @Default("gpt-4o-mini")
  @Column
  textModel: string;

  @Default("gpt-4o-mini")
  @Column
  visionModel: string;

  @Default("gpt-4o-mini-transcribe")
  @Column
  transcriptionModel: string;

  @Column(DataType.TEXT)
  basePrompt: string;

  @Default(0.3)
  @Column
  temperature: number;

  @Default(1024)
  @Column
  maxTokens: number;

  @ForeignKey(() => Queue)
  @Column
  fallbackQueueId: number;

  @BelongsTo(() => Queue)
  fallbackQueue: Queue;

  @Column(DataType.TEXT)
  handoffMessage: string;

  @Default(false)
  @Column
  ackEnabled: boolean;

  @Column(DataType.TEXT)
  ackMessage: string;

  @Default("legacy")
  @Column
  role: string;

  @Column
  specialty: string;

  @Column(DataType.TEXT)
  routingDescription: string;

  @Column(DataType.JSONB)
  routingKeywords: string[];

  @Default(100)
  @Column
  priority: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => AiAgentQueue)
  agentQueues: AiAgentQueue[];

  @HasMany(() => AiAgentKnowledgeBase)
  agentKnowledgeBases: AiAgentKnowledgeBase[];
}

export default AiAgent;
