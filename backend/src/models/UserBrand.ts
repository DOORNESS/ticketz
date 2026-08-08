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
  Default
} from "sequelize-typescript";
import User from "./User";
import Brand from "./Brand";
import Company from "./Company";

/**
 * Quais marcas um funcionário pode acessar, sem duplicar login.
 *
 * A ausência de linha significa "sem acesso": o vínculo é allowlist, não
 * denylist, para que criar uma marca nova não conceda acesso a ninguém por
 * omissão.
 *
 * `canAttend = false` = pode supervisionar/visualizar, mas não assumir nem
 * responder. É o supervisor que enxerga duas operações sem atender ambas.
 */
@Table({ tableName: "UserBrands" })
class UserBrand extends Model<UserBrand> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Brand)
  @Column
  brandId: number;

  @BelongsTo(() => Brand)
  brand: Brand;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default(true)
  @Column
  canAttend: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default UserBrand;
