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
import ContentRepositoryItem from "./ContentRepositoryItem";
import Ticket from "./Ticket";
import User from "./User";

@Table
class ContentRepositoryUsageLog extends Model<ContentRepositoryUsageLog> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => ContentRepositoryItem)
  @Column
  repositoryItemId: number;

  @BelongsTo(() => ContentRepositoryItem)
  repositoryItem: ContentRepositoryItem;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @Column
  channel: string;

  @Default("human")
  @Column
  source: string;

  @Column
  aiAgentId: number;

  @Default(true)
  @Column
  success: boolean;

  @Column
  errorCode: string;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContentRepositoryUsageLog;
