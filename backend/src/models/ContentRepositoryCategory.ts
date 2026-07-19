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

@Table
class ContentRepositoryCategory extends Model<ContentRepositoryCategory> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @Column
  slug: string;

  @Column
  name: string;

  @Column
  icon: string;

  @Default(100)
  @Column
  sortOrder: number;

  @Default(true)
  @Column
  active: boolean;

  @Default(true)
  @Column
  allowAiUse: boolean;

  @Column(DataType.JSONB)
  queueIds: number[];

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @Column
  archivedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContentRepositoryCategory;
