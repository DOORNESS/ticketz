/**
 * Determines allowed CORS origins based on environment variables.
 *
 * Environment variables:
 * - `FRONTEND_CUSTOM_URL`: Comma-separated list of additional allowed origins for CORS.
 * - `FRONTEND_URL_REGEX`: Regular expression pattern to match allowed origins dynamically.
 * - `FRONTEND_URL`: Primary frontend origin.
 */

const ALWAYS_ALLOWED_ORIGINS = [
  "https://suporte.fortmax.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const collectAllowedOrigins = (origin?: string): string[] => {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    ...ALWAYS_ALLOWED_ORIGINS,
    ...(process.env.FRONTEND_CUSTOM_URL || "")
      .split(",")
      .map(url => url.trim())
      .filter(Boolean)
  ].filter(Boolean) as string[];

  if (process.env.FRONTEND_URL_REGEX && origin) {
    const regex = new RegExp(process.env.FRONTEND_URL_REGEX);
    if (regex.test(origin)) {
      allowedOrigins.push(origin);
    }
  }

  return [...new Set(allowedOrigins)];
};

export const corsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  const allowedOrigins = collectAllowedOrigins(origin);

  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin} is not allowed by CORS`));
};
