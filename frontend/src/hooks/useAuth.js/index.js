import { useState, useEffect, useContext, useCallback, useRef } from "react";
import { useHistory } from "react-router-dom";
import { has, isArray } from "lodash";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { SocketContext } from "../../context/Socket/SocketContext";
import { clearAllCachedSettings } from "../../helpers/settingsCache";
import moment from "moment";
import { decodeToken } from "react-jwt";

let apiInterceptorsRegistered = false;
const TOKEN_REFRESH_INTERVAL_MS = 20 * 60 * 1000;
import { API_WARMUP_ERRORS, isApiWarmupError } from "../helpers/apiWarmup";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const parseStoredToken = () => {
  const raw = localStorage.getItem("token");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const isAccessTokenExpired = token => {
  if (!token) {
    return true;
  }

  try {
    const decoded = decodeToken(token);
    if (!decoded?.exp) {
      return true;
    }
    return decoded.exp * 1000 <= Date.now() + 60 * 1000;
  } catch {
    return true;
  }
};

const buildUserFromToken = token => {
  try {
    const decoded = decodeToken(token);
    if (!decoded?.id) {
      return {};
    }

    return {
      id: decoded.id,
      name: decoded.username || "",
      email: decoded.email || "",
      profile: decoded.profile || "user",
      super: decoded.super === true,
      companyId: decoded.companyId,
      queues: []
    };
  } catch {
    return {};
  }
};

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});
  const refreshTimerRef = useRef(null);

  const socketManager = useContext(SocketContext);

  const refreshSession = useCallback(
    async (retryCount = 0) => {
      try {
        const { data } = await api.post("/auth/refresh_token");
        if (!data?.token) {
          throw new Error("ERR_SESSION_EXPIRED");
        }

        localStorage.setItem("token", JSON.stringify(data.token));
        api.defaults.headers.Authorization = `Bearer ${data.token}`;
        socketManager.syncCurrentSocketToken?.(data.token);
        setIsAuth(true);
        if (data.user) {
          setUser(data.user);
        }
        return data;
      } catch (error) {
        const status = error?.response?.status;
        const warmingUp = isApiWarmupError(error);

        if ((status === 503 || status === 502 || warmingUp) && retryCount < 8) {
          await sleep(2500);
          return refreshSession(retryCount + 1);
        }

        throw error;
      }
    },
    [socketManager]
  );

  useEffect(() => {
    if (apiInterceptorsRegistered) {
      return;
    }
    apiInterceptorsRegistered = true;

    api.interceptors.request.use(
      config => {
        const token = parseStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      error => Promise.reject(error)
    );

    api.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;
        const status = error?.response?.status;

        if (
          status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !String(originalRequest.url || "").includes("/auth/refresh_token") &&
          !String(originalRequest.url || "").includes("/auth/login")
        ) {
          originalRequest._retry = true;

          try {
            const data = await refreshSession();
            if (data?.token) {
              originalRequest.headers.Authorization = `Bearer ${data.token}`;
              return api(originalRequest);
            }
          } catch (refreshError) {
            clearAllCachedSettings();
            localStorage.removeItem("token");
            localStorage.removeItem("companyId");
            api.defaults.headers.Authorization = undefined;
            setIsAuth(false);
            setUser({});
            return Promise.reject(refreshError);
          }
        }

        if (status === 401) {
          clearAllCachedSettings();
          localStorage.removeItem("token");
          localStorage.removeItem("companyId");
          api.defaults.headers.Authorization = undefined;
          setIsAuth(false);
          setUser({});
        }

        return Promise.reject(error);
      }
    );
  }, [socketManager, refreshSession]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = parseStoredToken();

      if (!token) {
        setLoading(false);
        return;
      }

      api.defaults.headers.Authorization = `Bearer ${token}`;

      try {
        const data = await refreshSession();
        setUser(data.user || buildUserFromToken(token));
      } catch (err) {
        if (!isAccessTokenExpired(token)) {
          setIsAuth(true);
          setUser(buildUserFromToken(token));
          refreshSession()
            .then(sessionData => {
              if (sessionData?.user) {
                setUser(sessionData.user);
              }
            })
            .catch(() => {
              clearAllCachedSettings();
              localStorage.removeItem("token");
              localStorage.removeItem("companyId");
              api.defaults.headers.Authorization = undefined;
              setIsAuth(false);
              setUser({});
            });
        } else {
          clearAllCachedSettings();
          localStorage.removeItem("token");
          localStorage.removeItem("companyId");
          api.defaults.headers.Authorization = undefined;
          setIsAuth(false);
          setUser({});
          if (!isApiWarmupError(err)) {
            toastError(err);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    bootstrapAuth();
  }, [refreshSession]);

  useEffect(() => {
    if (!isAuth) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return undefined;
    }

    refreshTimerRef.current = setInterval(() => {
      refreshSession().catch(() => {});
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [isAuth, refreshSession]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");
    if (!companyId || !user?.id) {
      return () => {};
    }
    const socket = socketManager.GetSocket(companyId);

    const onCompanyUserUseAuth = data => {
      if (data.action === "update" && data.user.id === user.id) {
        setUser(data.user);
      }
    };

    socket.on(`company-${companyId}-user`, onCompanyUserUseAuth);

    return () => {
      socket.off(`company-${companyId}-user`, onCompanyUserUseAuth);
    };
  }, [user?.id, socketManager]);

  const posLogin = (data, impersonated = false) => {
    const {
      user: { company },
      token
    } = data;

    const { companyId } = decodeToken(token);

    if (has(company, "settings") && isArray(company.settings)) {
      const setting = company.settings.find(s => s.key === "campaignsEnabled");
      if (setting && setting.value === "true") {
        localStorage.setItem("cshow", null);
      }
    }

    moment.locale("pt-br");
    const dueDate = data.user.company.dueDate;
    const vencimento = moment(dueDate).format("DD/MM/yyyy");

    const diff = moment(dueDate).diff(moment(moment()).format());
    const dias = moment.duration(diff).asDays();

    clearAllCachedSettings();

    localStorage.setItem("token", JSON.stringify(token));
    localStorage.setItem("companyId", companyId);
    localStorage.setItem("userId", data.user.id);
    localStorage.setItem("companyDueDate", vencimento);
    localStorage.setItem("impersonated", impersonated);
    api.defaults.headers.Authorization = `Bearer ${data.token}`;
    setUser(data.user);
    setIsAuth(true);

    if (dias < 0) {
      toast.warn(
        `Sua assinatura venceu há ${Math.round(dias) * -1} ${Math.round(dias) * -1 === 1 ? "dia" : "dias"} `
      );
    } else if (Math.round(dias) < 5) {
      toast.warn(
        `Sua assinatura vence em ${Math.round(dias)} ${Math.round(dias) === 1 ? "dia" : "dias"} `
      );
    } else {
      toast.success(i18n.t("auth.toasts.success"), {
        autoClose: 1500,
        hideProgressBar: true
      });
    }

    if (data.user.profile === "admin" && !data.user.hideAdminUI) {
      history.push("/");
    } else {
      history.push("/tickets");
    }
  };

  const handleLogin = async userData => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", userData);
      posLogin(data);
      return { ok: true };
    } catch (err) {
      toastError(err);
      return { ok: false, error: err };
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async companyId => {
    setLoading(true);

    try {
      const { data } = await api.get(`/auth/impersonate/${companyId}`);
      posLogin(data, true);
      setLoading(false);
      window.location.reload(false);
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);

    try {
      const impersonatedFlag = localStorage.getItem("impersonated") === "true";
      const token = localStorage.getItem("token");
      let impersonatedByToken = false;

      if (token) {
        try {
          const decoded = decodeToken(JSON.parse(token));
          impersonatedByToken = !!decoded?.impersonated;
        } catch (_) {
          impersonatedByToken = false;
        }
      }

      if (impersonatedFlag || impersonatedByToken) {
        const socket = socketManager.GetSocket();
        socket.logout();

        const { data } = await api.post("/auth/impersonate/back");
        localStorage.removeItem("impersonated");
        posLogin(data, false);
        setLoading(false);
        window.location.reload(false);
        return;
      }

      const socket = socketManager.GetSocket();
      socket.logout();

      await api.delete("/auth/logout");
      clearAllCachedSettings();
      setIsAuth(false);
      setUser({});
      localStorage.removeItem("token");
      localStorage.removeItem("companyId");
      localStorage.removeItem("userId");
      localStorage.removeItem("cshow");
      localStorage.removeItem("impersonated");
      api.defaults.headers.Authorization = undefined;

      setLoading(false);
      history.push("/login");
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const getCurrentUserInfo = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      return data;
    } catch (_) {
      return null;
    }
  }, []);

  return {
    isAuth,
    user,
    loading,
    handleLogin,
    handleImpersonate,
    handleLogout,
    getCurrentUserInfo
  };
};

export default useAuth;
