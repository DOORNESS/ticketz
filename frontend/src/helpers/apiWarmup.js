export const API_WARMUP_ERRORS = new Set([
  "ERR_API_WARMING_UP",
  "ERR_HEAVY_ROUTES_LOADING",
  "ERR_API_ROUTES_LOADING"
]);

export const isApiWarmupError = error =>
  API_WARMUP_ERRORS.has(error?.response?.data?.error);

export const isApiWarmupStatus = (status, errorCode) =>
  (status === 503 || status === 502) && API_WARMUP_ERRORS.has(errorCode);
