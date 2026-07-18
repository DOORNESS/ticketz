import {
  Table,
  Column,
  CreatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";
import AiAgent from "./AiAgent";

@Table({ updatedAt: false })
class AiRoutingLog extends Model<AiRoutingLog> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => Ticket)
  @Column({ allowNull: true })
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @Column({ allowNull: true })
  messageId: string;

  @Column(DataType.TEXT)
  userMessageSummary: string;

  @Column({ allowNull: true })
  orchestratorModel: string;

  @ForeignKey(() => AiAgent)
  @Column({ allowNull: true })
  selectedAgentId: number;

  @BelongsTo(() => AiAgent)
  selectedAgent: AiAgent;

  @Column({ allowNull: true })
  selectedSpecialty: string;

  @Column({ allowNull: true })
  confidence: number;

  @Column(DataType.TEXT)
  reason: string;

  @Column(DataType.JSONB)
  candidates: unknown;

  @Default(false)
  @Column
  fallbackUsed: boolean;

  @Default(false)
  @Column
  rerouted: boolean;

  @Column({ allowNull: true })
  latencyMs: number;

  @CreatedAt
  createdAt: Date;
}

export default AiRoutingLog;
