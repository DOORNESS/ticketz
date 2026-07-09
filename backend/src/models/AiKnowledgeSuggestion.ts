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
  Default
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";
import User from "./User";

@Table
class AiKnowledgeSuggestion extends Model<AiKnowledgeSuggestion> {
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
  suggestedTitle: string;

  @Column
  suggestedContent: string;

  @Default("pending")
  @Column
  status: string;

  @Column
  knowledgeBaseId: number;

  @Column
  documentId: number;

  @Column
  actionType: string;

  @Column
  mainQuestion: string;

  @Column
  organizedAnswer: string;

  @Column
  keywords: object;

  @Column
  category: string;

  @Column
  summary: string;

  @Column
  similarDocuments: object;

  @Column
  suggestedUpdate: string;

  @Column
  selectedDocumentId: number;

  @Column
  confidence: number;

  @Column
  conversationSummary: string;

  @Column
  transcript: string;

  @ForeignKey(() => User)
  @Column
  agentUserId: number;

  @ForeignKey(() => User)
  @Column
  approvedByUserId: number;

  @BelongsTo(() => User, "approvedByUserId")
  approvedBy: User;

  @Column
  approvedAt: Date;

  @Column
  rejectedAt: Date;

  @Column
  rejectionReason: string;

  @Column
  customerName: string;

  @Column
  queueName: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiKnowledgeSuggestion;
