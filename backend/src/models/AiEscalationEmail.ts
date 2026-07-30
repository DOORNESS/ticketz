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
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";
import User from "./User";

export type AiEscalationEmailStatus =
  | "pending"
  | "email_sent"
  | "resolved"
  | "failed";

@Table
class AiEscalationEmail extends Model<AiEscalationEmail> {
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

  @ForeignKey(() => User)
  @Column
  requestedByUserId: number | null;

  @BelongsTo(() => User)
  requestedByUser: User;

  @Default("pending")
  @Column
  status: AiEscalationEmailStatus;

  @Column(DataType.TEXT)
  requestNotes: string | null;

  @Column(DataType.TEXT)
  humanGuidance: string | null;

  @Column
  emailTo: string | null;

  @Column
  emailSubject: string | null;

  @Column
  resendMessageId: string | null;

  @Column
  resolvedAt: Date | null;

  @Column
  resolvedByEmail: string | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiEscalationEmail;
