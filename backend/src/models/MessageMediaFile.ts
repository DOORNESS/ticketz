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
import User from "./User";

export type StoredMediaStatus =
  | "pending"
  | "available"
  | "delete_pending"
  | "deleted"
  | "delete_failed"
  | "expired";

@Table({ updatedAt: false })
class MessageMediaFile extends Model<MessageMediaFile> {
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

  @Column
  contactId: number;

  @Column
  mediaType: string;

  @Column
  mimeType: string;

  @Column
  originalFilename: string;

  @Column(DataType.BIGINT)
  sizeBytes: number;

  @Default("backblaze")
  @Column
  storageProvider: string;

  @Column
  storageKey: string;

  @Column
  bucket: string;

  @Column
  publicUrl: string;

  @Column
  hash: string;

  @Default("inbound")
  @Column
  direction: string;

  @Column(DataType.TEXT)
  transcriptionText: string;

  @Column(DataType.TEXT)
  visionSummary: string;

  @ForeignKey(() => User)
  @Column
  uploadedByUserId: number;

  @Default("available")
  @Column
  status: StoredMediaStatus;

  @Column
  expiresAt: Date;

  @Column
  deletedAt: Date;

  @Column
  deleteRequestedAt: Date;

  @Default(0)
  @Column
  deleteAttempts: number;

  @Column(DataType.TEXT)
  lastDeleteError: string;

  @Default(false)
  @Column
  retentionExempt: boolean;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @BelongsTo(() => User)
  uploadedByUser: User;

  @CreatedAt
  createdAt: Date;
}

export default MessageMediaFile;
