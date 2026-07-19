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
import User from "./User";
import ContentRepositoryItem from "./ContentRepositoryItem";

@Table
class ContentRepositoryItemVersion extends Model<ContentRepositoryItemVersion> {
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

  @Column
  versionNumber: number;

  @Column
  storageKey: string;

  @Column
  originalFileName: string;

  @Column
  fileSize: number;

  @Column
  mimeType: string;

  @Column
  checksum: string;

  @Column(DataType.TEXT)
  changeReason: string;

  @ForeignKey(() => User)
  @Column
  authorUserId: number;

  @BelongsTo(() => User, "authorUserId")
  author: User;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContentRepositoryItemVersion;
