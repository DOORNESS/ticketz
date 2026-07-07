import axios from "axios";
import { getBackendURL } from "../services/config";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const api = axios.create({
  baseURL: getBackendURL(),
  withCredentials: true,
  timeout: 30000
});

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    const status = error?.response?.status;
    const retryable =
      !originalRequest?._apiRetry &&
      (status === 503 ||
        status === 502 ||
        status === 504 ||
        error?.code === "ERR_NETWORK");

    if (!retryable) {
      return Promise.reject(error);
    }

    originalRequest._apiRetry = true;
    await sleep(2000);
    return api(originalRequest);
  }
);

export const openApi = axios.create({
  baseURL: getBackendURL(),
  timeout: 30000
});

export default api;
