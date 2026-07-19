import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";

@Table
class ContentRepositoryPermission extends Model<ContentRepositoryPermission> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @Default("profile")
  @Column
  principalType: string;

  @Column
  principalId: string;

  @Column
  permission: string;

  @Default("repository")
  @Column
  resourceType: string;

  @Default(0)
  @Column
  resourceId: number;

  @Default(true)
  @Column
  active: boolean;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContentRepositoryPermission;
