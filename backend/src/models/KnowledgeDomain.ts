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
  HasMany,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Brand from "./Brand";
import KnowledgeBase from "./KnowledgeBase";

@Table
class KnowledgeDomain extends Model<KnowledgeDomain> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Brand)
  @Column
  brandId: number;

  @BelongsTo(() => Brand)
  brand: Brand;

  @Column
  slug: string;

  @Column
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Column
  linkedSpecialty: string;

  @Default(100)
  @Column
  sortOrder: number;

  @Default(true)
  @Column
  active: boolean;

  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => KnowledgeBase)
  knowledgeBases: KnowledgeBase[];
}

export default KnowledgeDomain;
