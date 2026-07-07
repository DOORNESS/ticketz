import axios from "axios";
import AppError from "../../errors/AppError";
import {
  getTurnstileSecretKey,
  isTurnstileEnabled
} from "./TurnstileConfigService";

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

export const verifyTurnstileToken = async (
  token?: string,
  remoteIp?: string
): Promise<void> => {
  const enabled = await isTurnstileEnabled();
  if (!enabled) {
    return;
  }

  if (!token?.trim()) {
    throw new AppError("ERR_TURNSTILE_REQUIRED", 401);
  }

  const secret = await getTurnstileSecretKey();
  if (!secret) {
    throw new AppError("ERR_TURNSTILE_NOT_CONFIGURED", 500);
  }

  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token.trim());
  if (remoteIp) {
    params.append("remoteip", remoteIp);
  }

  const { data } = await axios.post<TurnstileVerifyResponse>(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    params,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000
    }
  );

  if (!data?.success) {
    throw new AppError("ERR_TURNSTILE_INVALID", 401);
  }
};
