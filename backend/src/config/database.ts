import "../bootstrap";

const schema = process.env.DB_SCHEMA || "ticketz";

function parsePoolInt(value: string | undefined, fallback: number): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
    max: parsePoolInt(process.env.DB_MAX_CONNECTIONS, 60),
    min: parsePoolInt(process.env.DB_MIN_CONNECTIONS, 5),
    acquire: parsePoolInt(process.env.DB_ACQUIRE, 60000),
    idle: parsePoolInt(process.env.DB_IDLE, 10000)
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
    connectTimeout: parsePoolInt(process.env.DB_CONNECT_TIMEOUT, 15000),
    options: `-c search_path=${schema},public,extensions`
  }
};
