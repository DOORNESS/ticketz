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
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";

@Table({ tableName: "AiTicketTimelineEvents" })
class AiTicketTimelineEvent extends Model<AiTicketTimelineEvent> {
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
  eventType: string;

  @Column
  stage: string;

  @Column
  operation: string;

  @Column
  correlationId: string;

  @Column
  messageId: string;

  @Column
  agentId: number;

  @Column
  errorClass: string;

  @Column(DataType.JSONB)
  details: object;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiTicketTimelineEvent;
