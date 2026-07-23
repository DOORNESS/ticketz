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

export type MediaDeletionAuditStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

@Table
class MediaDeletionAudit extends Model<MediaDeletionAudit> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @Column
  ticketId: number;

  @Column
  requestedByUserId: number;

  @Column
  operation: string;

  @Column
  reason: string;

  @Default(0)
  @Column
  messageCount: number;

  @Default(0)
  @Column
  mediaCount: number;

  @Column(DataType.BIGINT)
  bytesRemoved: number;

  @Default("pending")
  @Column
  status: MediaDeletionAuditStatus;

  @Column(DataType.JSONB)
  details: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default MediaDeletionAudit;
