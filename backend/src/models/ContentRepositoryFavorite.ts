import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import ContentRepositoryItem from "./ContentRepositoryItem";

@Table
class ContentRepositoryFavorite extends Model<ContentRepositoryFavorite> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => ContentRepositoryItem)
  @Column
  repositoryItemId: number;

  @BelongsTo(() => ContentRepositoryItem)
  repositoryItem: ContentRepositoryItem;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContentRepositoryFavorite;
