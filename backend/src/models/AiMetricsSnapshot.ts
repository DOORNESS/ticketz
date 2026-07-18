import {
  Table,
  Column,
  CreatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  DataType
} from "sequelize-typescript";
import Company from "./Company";

@Table({ updatedAt: false })
class AiMetricsSnapshot extends Model<AiMetricsSnapshot> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @Column
  periodType: string;

  @Column
  periodStart: Date;

  @Column(DataType.JSONB)
  metricsJson: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;
}

export default AiMetricsSnapshot;
