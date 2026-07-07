import { useContext, useEffect } from "react";
import api, { openApi } from "../../services/api";
import { Mutex } from "async-mutex";
import { SocketContext } from "../../context/Socket/SocketContext";
import {
  clearAllCachedSettings,
  clearCachedSettingsKey,
  setCachedSettingValue
} from "../../helpers/settingsCache";

const cachedSettingsMutex = new Mutex();
const publicSettingsInFlight = new Map();
const PUBLIC_SETTING_PREFIX = "public:";
const safeSettingsKeys = new Set([
  "groupsTab",
  "CheckMsgIsGroup",
  "soundGroupNotifications",
  "tagsMode"
]);

const useSettings = () => {
  const getSettingFromApi = async (key, defaultValue = "") => {
    if (!api.defaults.headers.Authorization) {
      return defaultValue;
    }
    const { data } = await api.request({
      url: `/settings/${key}`,
      method: "GET"
    });

    if (!data) {
      return defaultValue;
    }

    setCachedSettingValue(key, data);

    return data;
  };

  const get = async key => {
    const { data } = await api.request({
      url: `/settings/${key}`,
      method: "GET"
    });
    return data;
  };

  const getAll = async params => {
    const { data } = await api.request({
      url: "/settings",
      method: "GET",
      params
    });
    return data;
  };

  const update = async data => {
    const { data: responseData } = await api.request({
      url: `/settings/${data.key}`,
      method: "PUT",
      data: {
        value: data.value
      }
    });

    setCachedSettingValue(data.key, data.value);

    return responseData;
  };

  const getPublicSetting = async key => {
    const cacheKey = `${PUBLIC_SETTING_PREFIX}${key}`;

    return cachedSettingsMutex.runExclusive(async () => {
      const cached = sessionStorage.getItem(cacheKey);
      const timestamp = sessionStorage.getItem(`${cacheKey}_timestamp`);
      if (cached) {
        if (timestamp && Date.now() - timestamp > 10 * 60 * 1000) {
          clearCachedSettingsKey(cacheKey);
        } else {
          const parsedValue = JSON.parse(cached);
          if (parsedValue != null && parsedValue !== "") {
            return parsedValue;
          }
          clearCachedSettingsKey(cacheKey);
        }
      }

      if (publicSettingsInFlight.has(key)) {
        return publicSettingsInFlight.get(key);
      }

      const request = openApi
        .request({
          url: `/public-settings/${key}`,
          method: "GET"
        })
        .then(({ data }) => {
          if (data != null && data !== "") {
            setCachedSettingValue(cacheKey, data);
          }
          publicSettingsInFlight.delete(key);
          return data;
        })
        .catch(error => {
          publicSettingsInFlight.delete(key);
          throw error;
        });

      publicSettingsInFlight.set(key, request);
      return request;
    });
  };

  const getSetting = async (key, defaultValue = "") => {
    if (safeSettingsKeys.has(key)) {
      return getCachedSetting(key, defaultValue);
    }

    return getSettingFromApi(key, defaultValue);
  };

  const getCachedSetting = async (key, defaultValue = "") => {
    return await cachedSettingsMutex.runExclusive(() => {
      const cached = sessionStorage.getItem(key);
      const timestamp = sessionStorage.getItem(`${key}_timestamp`);
      if (cached) {
        // check if timestamp is older than 10 minutes
        if (timestamp && Date.now() - timestamp > 10 * 60 * 1000) {
          clearCachedSettingsKey(key);
        } else {
          return JSON.parse(cached);
        }
      }
      return getSettingFromApi(key, defaultValue);
    });
  };

  const socketManager = useContext(SocketContext);

  useEffect(() => {
    if (!socketManager) {
      return () => {};
    }

    const socket = socketManager.GetSocket();

    const onSettingsUseSettings = data => {
      if (typeof data?.key !== "string" || !data.key) {
        return;
      }

      setCachedSettingValue(data.key, data.value);
    };

    socket.on("settings", onSettingsUseSettings);

    let unsubscribeWsConnectionIssue = null;
    if (typeof socketManager.subscribeWsConnectionIssue === "function") {
      unsubscribeWsConnectionIssue = socketManager.subscribeWsConnectionIssue(
        active => {
          if (active) {
            clearAllCachedSettings();
          }
        }
      );
    }

    return () => {
      if (typeof unsubscribeWsConnectionIssue === "function") {
        unsubscribeWsConnectionIssue();
      }
      socket.disconnect();
    };
  }, [socketManager]);

  return {
    get,
    getAll,
    getPublicSetting,
    getSetting,
    getCachedSetting,
    update
  };
};

export default useSettings;
