/**
 * Determines allowed CORS origins based on environment variables.
 *
 * Environment variables:
 * - `FRONTEND_CUSTOM_URL`: Comma-separated list of additional allowed origins for CORS.
 * - `FRONTEND_URL_REGEX`: Regular expression pattern to match allowed origins dynamically.
 * - `FRONTEND_URL`: Primary frontend origin.
 * - `BACKEND_URL`: Backend's own public origin (required by public HTML forms).
 */

const ALWAYS_ALLOWED_ORIGINS = [
  "https://suporte.fortmax.com.br",
  "https://api.fortmax.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];

const normalizeOrigin = (value?: string): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

const collectAllowedOrigins = (origin?: string): string[] => {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.BACKEND_URL,
    ...ALWAYS_ALLOWED_ORIGINS,
    ...(process.env.FRONTEND_CUSTOM_URL || "")
      .split(",")
      .map(url => url.trim())
      .filter(Boolean)
  ]
    .map(value => normalizeOrigin(value))
    .filter(Boolean) as string[];

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
  const normalizedOrigin = normalizeOrigin(origin);

  if (
    !origin ||
    (normalizedOrigin && allowedOrigins.includes(normalizedOrigin))
  ) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin} is not allowed by CORS`));
};
