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
  DataType,
  Default,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";

export type BrandSupportContact = {
  name: string;
  role?: string;
  whatsapp?: string;
  email?: string;
};

/**
 * Marca / linha de atendimento dentro de uma Company.
 *
 * Centraliza o que antes estava espalhado em código: persona, contatos,
 * URLs, fallback e vocabulário. Adicionar uma marca nova é criar um
 * registro — não editar `if (brand === "nivel")` em vários arquivos.
 */
@Table({ tableName: "Brands" })
class Brand extends Model<Brand> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  /** Identificador estável usado em código e API. Único por company. */
  @Column
  slug: string;

  @Column
  name: string;

  @Default(true)
  @Column
  active: boolean;

  @Default(0)
  @Column
  sortOrder: number;

  @AllowNull
  @Column
  logoUrl: string;

  @AllowNull
  @Column
  primaryColor: string;

  /** Rótulo curto para o badge na lista de tickets. */
  @AllowNull
  @Column
  shortLabel: string;

  @AllowNull
  @Column
  identityName: string;

  @AllowNull
  @Column(DataType.TEXT)
  identityReply: string;

  @AllowNull
  @Column
  escalationUrl: string;

  @AllowNull
  @Column(DataType.TEXT)
  informationalFallback: string;

  @Default([])
  @Column(DataType.JSONB)
  supportContacts: BrandSupportContact[];

  @Default([])
  @Column(DataType.JSONB)
  vocabulary: string[];

  @Default({})
  @Column(DataType.JSONB)
  settings: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Brand;
