import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  DataType
} from "sequelize-typescript";
import Company from "./Company";

@Table
class AiToolIdempotencyRecord extends Model<AiToolIdempotencyRecord> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @Column
  idempotencyKey: string;

  @Column
  toolId: string;

  @Column
  ticketId: number;

  @Column
  contactId: number;

  @Column
  aiAgentId: number;

  @Column
  correlationId: string;

  @Column
  success: boolean;

  @Column(DataType.TEXT)
  resultSanitized: string;

  @Column
  mutationTarget: string;

  @Column
  mutationTargetId: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiToolIdempotencyRecord;
