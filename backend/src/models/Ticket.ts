import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  HasMany,
  AutoIncrement,
  Default,
  BeforeCreate,
  BelongsToMany,
  HasOne,
  DataType
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";

import Contact from "./Contact";
import Message from "./Message";
import Queue from "./Queue";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Company from "./Company";
import QueueOption from "./QueueOption";
import Tag from "./Tag";
import TicketTag from "./TicketTag";
import TicketTraking from "./TicketTraking";

@Table
class Ticket extends Model<Ticket> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column({ defaultValue: "pending" })
  status: string;

  @Column({ defaultValue: "whatsapp" })
  channel: string;

  @Column
  unreadMessages: number;

  @Column
  lastMessage: string;

  @Default(false)
  @Column
  isGroup: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column
  chatbot: boolean;

  @ForeignKey(() => QueueOption)
  @Column
  queueOptionId: number;

  @BelongsTo(() => QueueOption)
  queueOption: QueueOption;

  @HasMany(() => Message)
  messages: Message[];

  @HasMany(() => TicketTag)
  ticketTags: TicketTag[];

  @BelongsToMany(() => Tag, () => TicketTag)
  tags: Tag[];

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default(false)
  @Column
  aiHandoff: boolean;

  @Column
  aiAgentId: number;

  @Column
  aiHandoffReason: string;

  @Default(false)
  @Column
  aiPaused: boolean;

  @Default(false)
  @Column
  aiResolvedByAi: boolean;

  @Column
  aiHandoffAt: Date;

  @Column
  aiWaitingSince: Date;

  @Column
  aiStartedAt: Date;

  @Default(false)
  @Column
  aiSlaBreached: boolean;

  @Column
  aiHandoffSummary: string;

  @Column
  aiPriority: string;

  @Column
  aiLastConfidence: number;

  @Column
  aiEndedAt: Date;

  @Default(0)
  @Column
  aiResponseCount: number;

  @Default(0)
  @Column
  aiTotalTokensInput: number;

  @Default(0)
  @Column
  aiTotalTokensOutput: number;

  @Default(0)
  @Column
  aiEstimatedCostUsd: number;

  @Column
  aiSatisfactionRating: number;

  @Column
  aiSatisfactionSource: string;

  @Default(0)
  @Column
  aiSlaEscalationLevel: number;

  @Column(DataType.JSONB)
  aiLastExplainability: object;

  @Column
  aiLastSlaAlertAt: Date;

  @Column
  aiHandoffMode: string;

  @Column
  aiHandoffOriginalReason: string;

  @Column(DataType.JSONB)
  aiCaseCompleteness: object;

  @Default(0)
  @Column
  aiInvestigationRound: number;

  @Column
  aiCorrelationId: string;

  @Column
  aiProcessingState: string;

  @Default(false)
  @Column
  aiSkipLegacyOutOfHoursOnHandoff: boolean;

  @Default(false)
  @Column
  aiAssistActive: boolean;

  @Column
  aiAssistMode: string;

  @Column
  aiAssistRequestedAt: Date;

  @Column
  aiAssistRequestedBy: number;

  @Column
  aiAssistAgentId: number;

  @Column
  aiHumanAssumedAt: Date;

  @Column
  aiHumanAssumedBy: number;

  @Default(uuidv4())
  @Column
  uuid: string;

  @BeforeCreate
  static setUUID(ticket: Ticket) {
    ticket.uuid = uuidv4();
  }

  @HasMany(() => TicketTraking)
  ticketTrakings: TicketTraking;
}

export default Ticket;
