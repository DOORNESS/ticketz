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
import Ticket from "./Ticket";

@Table
class AiReplayLog extends Model<AiReplayLog> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @Column
  messageId: string;

  @Column
  userQuestion: string;

  @Column
  conversationHistory: object;

  @Column
  systemPrompt: string;

  @Column
  usedChunks: object;

  @Column
  aiResponse: string;

  @Column
  confidence: number;

  @Column
  explainability: object;

  @Column
  tokensInput: number;

  @Column
  tokensOutput: number;

  @Column
  latencyMs: number;

  @Column
  costUsd: number;

  @Column
  model: string;

  @Column
  mediaType: string;

  @Column
  visionSummary: string;

  @Column
  ocrText: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiReplayLog;
