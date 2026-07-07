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

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => AiAgentQueue)
  agentQueues: AiAgentQueue[];
}

export default AiAgent;
