import { useState, useEffect, useCallback } from "react";
import toastError from "../../errors/toastError";

import api from "../../services/api";

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
  withUnreadMessages,
  notClosed,
  all,
  aiFilter,
  supervision
}) => {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchTickets = async () => {
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
              withUnreadMessages,
              notClosed,
              all,
              aiFilter,
              supervision
            }
          });
          setTickets(data.tickets);
          setLoading(false);
        } catch (err) {
          setTickets([]);
          setLoading(false);
          if (err?.response?.status && err.response.status < 500) {
            toastError(err);
          }
        }
      };
      fetchTickets();
    }, 500);
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
    withUnreadMessages,
    isSearch,
    notClosed,
    all,
    aiFilter,
    supervision,
    refreshTrigger
  ]);

  const refetch = useCallback(() => {
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
