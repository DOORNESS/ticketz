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
  Default
} from "sequelize-typescript";
import Company from "./Company";
import Brand from "./Brand";
import KnowledgeDocument from "./KnowledgeDocument";
import KnowledgeDomain from "./KnowledgeDomain";

@Table
class KnowledgeBase extends Model<KnowledgeBase> {
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
  name: string;

  @Column
  description: string;

  @Default(true)
  @Column
  active: boolean;

  @ForeignKey(() => KnowledgeDomain)
  @Column
  knowledgeDomainId: number;

  @BelongsTo(() => KnowledgeDomain)
  knowledgeDomain: KnowledgeDomain;

  @Column
  slug: string;

  @Column
  linkedSpecialty: string;

  @Default(false)
  @Column
  requiresPublishWorkflow: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => KnowledgeDocument)
  documents: KnowledgeDocument[];
}

export default KnowledgeBase;
