import crypto from "crypto";
import AppError from "../../errors/AppError";

export type EscalationTokenPayload = {
  eid: number;
  tid: number;
  cid: number;
  exp: number;
};

const getHookSecret = (): string => {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET?.trim();
  if (!secret) {
    throw new AppError("ERR_ESCALATION_EMAIL_NOT_CONFIGURED", 503);
  }
  return secret;
};

const toBase64Url = (value: string): string =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64").toString("utf8");
};

const signPayload = (payloadB64: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

export const getEscalationTokenTtlHours = (): number => {
  const parsed = Number(process.env.ESCALATION_EMAIL_TOKEN_TTL_HOURS || 168);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 168;
};

export const createEscalationToken = (payload: {
  escalationId: number;
  ticketId: number;
  companyId: number;
}): string => {
  const secret = getHookSecret();
  const exp =
    Math.floor(Date.now() / 1000) + getEscalationTokenTtlHours() * 60 * 60;
  const body: EscalationTokenPayload = {
    eid: payload.escalationId,
    tid: payload.ticketId,
    cid: payload.companyId,
    exp
  };
  const payloadB64 = toBase64Url(JSON.stringify(body));
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
};

export const verifyEscalationToken = (
  token: string
): EscalationTokenPayload => {
  if (!token?.trim()) {
    throw new AppError("ERR_ESCALATION_TOKEN_INVALID", 400);
  }

  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) {
    throw new AppError("ERR_ESCALATION_TOKEN_INVALID", 400);
  }

  const secret = getHookSecret();
  const expected = signPayload(payloadB64, secret);
  const expectedBytes = Uint8Array.from(Buffer.from(expected, "utf8"));
  const signatureBytes = Uint8Array.from(Buffer.from(signature, "utf8"));
  if (
    expectedBytes.length !== signatureBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, signatureBytes)
  ) {
    throw new AppError("ERR_ESCALATION_TOKEN_INVALID", 400);
  }

  let payload: EscalationTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadB64)) as EscalationTokenPayload;
  } catch {
    throw new AppError("ERR_ESCALATION_TOKEN_INVALID", 400);
  }

  if (
    !payload?.eid ||
    !payload?.tid ||
    !payload?.cid ||
    !payload?.exp ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw new AppError("ERR_ESCALATION_TOKEN_EXPIRED", 410);
  }

  return payload;
};

export const buildEscalationFormUrl = (token: string): string => {
  const backendUrl = (
    process.env.BACKEND_URL || "http://localhost:8080"
  ).replace(/\/$/, "");
  return `${backendUrl}/escalation/${encodeURIComponent(token)}?v=${Date.now()}`;
};
