import axios from "axios";
import { getBackendURL } from "../services/config";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const API_TIMEOUT_MS = 45000;
const MAX_API_RETRIES = 2;

const attachRetryInterceptor = client => {
  client.interceptors.response.use(
    response => response,
    async error => {
      const originalRequest = error.config;
      const status = error?.response?.status;
      const retryCount = originalRequest?._apiRetryCount || 0;
      const retryable =
        retryCount < MAX_API_RETRIES &&
        (status === 503 ||
          status === 502 ||
          status === 504 ||
          error?.code === "ERR_NETWORK" ||
          error?.code === "ECONNABORTED");

      if (!retryable) {
        return Promise.reject(error);
      }

      originalRequest._apiRetryCount = retryCount + 1;
      await sleep(2000 * originalRequest._apiRetryCount);
      return client(originalRequest);
    }
  );
};

const api = axios.create({
  baseURL: getBackendURL(),
  withCredentials: true,
  timeout: API_TIMEOUT_MS
});

attachRetryInterceptor(api);

export const openApi = axios.create({
  baseURL: getBackendURL(),
  timeout: API_TIMEOUT_MS
});

attachRetryInterceptor(openApi);

export default api;
