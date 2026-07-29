import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import toastError from "../../errors/toastError";
import { isApiWarmupError } from "../../helpers/apiWarmup";
import {
  buildTicketsCacheKey,
  readTicketsCache,
  writeTicketsCache
} from "../../helpers/ticketsListCache";

import api from "../../services/api";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const useTickets = ({
  isSearch,
  searchParam,
  contactId,
  tags,
  users,
  nextUpdatedAt,
  nextTicketId,
  status,
  groups,
  date,
  updatedAt,
  showAll,
  queueIds,
  whatsappIds,
  withUnreadMessages,
  notClosed,
  all,
  aiFilter,
  supervision,
  fetchEnabled = true
}) => {
  const cacheKey = useMemo(
    () =>
      buildTicketsCacheKey({
        isSearch,
        searchParam,
        contactId,
        tags,
        users,
        status,
        groups,
        date,
        updatedAt,
        showAll,
        queueIds,
        whatsappIds,
        withUnreadMessages,
        notClosed,
        all,
        aiFilter,
        supervision
      }),
    [
      isSearch,
      searchParam,
      contactId,
      tags,
      users,
      status,
      groups,
      date,
      updatedAt,
      showAll,
      queueIds,
      whatsappIds,
      withUnreadMessages,
      notClosed,
      all,
      aiFilter,
      supervision
    ]
  );

  const cachedEntry = useMemo(
    () => (fetchEnabled ? readTicketsCache(cacheKey) : null),
    [cacheKey, fetchEnabled]
  );

  const [loading, setLoading] = useState(
    fetchEnabled ? !cachedEntry?.tickets?.length : false
  );
  const [tickets, setTickets] = useState(cachedEntry?.tickets ?? []);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const skipDebounceRef = useRef(Boolean(cachedEntry?.tickets?.length));
  const isFirstFetchRef = useRef(true);
  const ticketsRef = useRef([]);

  ticketsRef.current = tickets;

  useEffect(() => {
    if (!fetchEnabled) {
      return;
    }

    const entry = readTicketsCache(cacheKey);
    if (entry?.tickets?.length) {
      setTickets(entry.tickets);
      setLoading(false);
      skipDebounceRef.current = true;
    } else if (ticketsRef.current.length === 0) {
      setLoading(true);
    }
  }, [cacheKey, fetchEnabled]);

  useEffect(() => {
    if (!fetchEnabled) {
      return undefined;
    }

    const hasCachedTickets = ticketsRef.current.length > 0;
    const isBackgroundRefetch = skipDebounceRef.current || hasCachedTickets;
    const debounceMs =
      skipDebounceRef.current || isFirstFetchRef.current ? 0 : 200;

    skipDebounceRef.current = false;
    isFirstFetchRef.current = false;

    if (!isBackgroundRefetch && ticketsRef.current.length === 0) {
      setLoading(true);
    }

    const delayDebounceFn = setTimeout(() => {
      const fetchTickets = async () => {
        let attempt = 0;
        while (attempt < 15) {
          try {
            const { data } = await api.get("/tickets", {
              params: {
                isSearch,
                searchParam,
                nextUpdatedAt,
                nextTicketId,
                contactId,
                tags,
                users,
                status,
                groups,
                date,
                updatedAt,
                showAll,
                queueIds,
                whatsappIds,
                withUnreadMessages,
                notClosed,
                all,
                aiFilter,
                supervision
              }
            });
            setTickets(data.tickets);
            writeTicketsCache(cacheKey, data.tickets);
            setLoading(false);
            return;
          } catch (err) {
            const statusCode = err?.response?.status;
            if (
              (statusCode === 503 ||
                statusCode === 502 ||
                isApiWarmupError(err)) &&
              attempt < 14
            ) {
              attempt += 1;
              await sleep(2500);
              continue;
            }

            if (ticketsRef.current.length === 0) {
              setTickets([]);
            }
            setLoading(false);
            if (statusCode && statusCode < 500) {
              toastError(err);
            }
            return;
          }
        }
      };
      fetchTickets();
    }, debounceMs);

    return () => clearTimeout(delayDebounceFn);
  }, [
    cacheKey,
    searchParam,
    contactId,
    tags,
    users,
    nextUpdatedAt,
    nextTicketId,
    status,
    groups,
    date,
    updatedAt,
    showAll,
    queueIds,
    whatsappIds,
    withUnreadMessages,
    isSearch,
    notClosed,
    all,
    aiFilter,
    supervision,
    refreshTrigger,
    fetchEnabled
  ]);

  const refetch = useCallback(() => {
    skipDebounceRef.current = true;
    setRefreshTrigger(prevState => prevState + 1);
  }, []);

  const fetchSince = useCallback(
    async minUpdatedAt => {
      const { data } = await api.get("/tickets", {
        params: {
          isSearch,
          searchParam,
          contactId,
          tags,
          users,
          status,
          groups,
          date,
          updatedAt,
          showAll,
          queueIds,
          whatsappIds,
          withUnreadMessages,
          notClosed,
          all,
          minUpdatedAt,
          aiFilter,
          supervision
        }
      });
      return data.tickets;
    },
    [
      isSearch,
      searchParam,
      contactId,
      tags,
      users,
      status,
      groups,
      date,
      updatedAt,
      showAll,
      queueIds,
      whatsappIds,
      withUnreadMessages,
      notClosed,
      all,
      aiFilter,
      supervision
    ]
  );

  return {
    tickets,
    loading,
    refetch,
    fetchSince
  };
};

export default useTickets;
