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

  @BelongsTo(() => User)
  uploadedByUser: User;

  @CreatedAt
  createdAt: Date;
}

export default MessageMediaFile;
