import {
  Table,
  Column,
  CreatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";

@Table({ updatedAt: false })
class AiConversationLog extends Model<AiConversationLog> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @Column
  messageId: string;

  @Default("inbound")
  @Column
  direction: string;

  @Column(DataType.TEXT)
  userMessage: string;

  @Column(DataType.TEXT)
  aiResponse: string;

  @Column(DataType.JSONB)
  usedChunks: unknown;

  @Column
  model: string;

  @Column
  tokensInput: number;

  @Column
  tokensOutput: number;

  @Default(false)
  @Column
  transferredToHuman: boolean;

  @Column(DataType.TEXT)
  error: string;

  @CreatedAt
  createdAt: Date;
}

export default AiConversationLog;
