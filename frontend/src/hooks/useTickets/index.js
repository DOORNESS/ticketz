import { useState, useEffect, useCallback, useRef } from "react";
import toastError from "../../errors/toastError";
import { isApiWarmupError } from "../../helpers/apiWarmup";

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
  supervision
}) => {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const skipDebounceRef = useRef(false);

  useEffect(() => {
    const debounceMs = skipDebounceRef.current ? 0 : 200;
    skipDebounceRef.current = false;
    setLoading(true);
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
            setLoading(false);
            return;
          } catch (err) {
            const status = err?.response?.status;
            if (
              (status === 503 || status === 502 || isApiWarmupError(err)) &&
              attempt < 14
            ) {
              attempt += 1;
              await sleep(2500);
              continue;
            }

            setTickets([]);
            setLoading(false);
            if (err?.response?.status && err.response.status < 500) {
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
    refreshTrigger
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
