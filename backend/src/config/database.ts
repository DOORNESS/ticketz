import "../bootstrap";

const schema = process.env.DB_SCHEMA || "ticketz";

const sslDialectOptions =
  process.env.DB_SSL === "true"
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
        }
      }
    : {};

module.exports = {
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_bin",
    schema
  },
  schema,
  pool: {
    max: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 60,
    min: parseInt(process.env.DB_MIN_CONNECTIONS, 10) || 5,
    acquire: parseInt(process.env.DB_ACQUIRE, 10) || 30000,
    idle: parseInt(process.env.DB_IDLE, 10) || 10000
  },
  dialect: process.env.DB_DIALECT || "postgres",
  timezone: process.env.DB_TIMEZONE || "-03:00",
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  logging: process.env.DB_DEBUG && console.log,
  migrationStorage: "sequelize",
  migrationStorageTableName: "SequelizeMeta",
  migrationStorageTableSchema: schema,
  seederStorage: "sequelize",
  seederStorageTableName: "SequelizeData",
  seederStorageTableSchema: schema,
  dialectOptions: {
    ...sslDialectOptions,
    options: `-c search_path=${schema},public,extensions`
  }
};
