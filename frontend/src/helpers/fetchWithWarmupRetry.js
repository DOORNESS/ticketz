import api from "../services/api";
import { isApiWarmupError } from "./apiWarmup";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = error => {
  const status = error?.response?.status;
  return (
    isApiWarmupError(error) ||
    status === 503 ||
    status === 502 ||
    status === 504 ||
    error?.code === "ERR_NETWORK" ||
    error?.code === "ECONNABORTED"
  );
};

export async function apiGetWithWarmupRetry(url, config = {}, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await api.get(url, {
        ...config,
        timeout: config.timeout || 15000,
        _skipApiRetry: true
      });
    } catch (error) {
      if (!isRetryableError(error) || attempt >= maxRetries) {
        throw error;
      }
      await sleep(750);
    }
  }

  throw new Error("ERR_API_WARMUP_EXHAUSTED");
}
