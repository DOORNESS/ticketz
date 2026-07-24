import React, { useState, useRef, useCallback, createContext } from "react";

const TicketsContext = createContext();

const TicketsContextProvider = ({ children }) => {
  const [currentTicket, setCurrentTicket] = useState({
    id: null,
    code: null,
    uuid: null
  });
  const [observationMode, setObservationMode] = useState(false);
  const [listSubTab, setListSubTab] = useState("open");
  const [listRevision, setListRevision] = useState(0);
  const messageHandlersRef = useRef({});

  const refreshTicketLists = () => {
    setListRevision(value => value + 1);
  };

  const registerMessageHandlers = useCallback(handlers => {
    messageHandlersRef.current = handlers || {};
    return () => {
      messageHandlersRef.current = {};
    };
  }, []);

  const notifyMessageSent = useCallback(message => {
    const handlers = messageHandlersRef.current;
    if (message?.id && handlers.append) {
      handlers.append(message);
      return;
    }
    handlers.refresh?.();
  }, []);

  return (
    <TicketsContext.Provider
      value={{
        currentTicket,
        setCurrentTicket,
        observationMode,
        setObservationMode,
        listSubTab,
        setListSubTab,
        listRevision,
        refreshTicketLists,
        registerMessageHandlers,
        notifyMessageSent
      }}
    >
      {children}
    </TicketsContext.Provider>
  );
};

export { TicketsContext, TicketsContextProvider };
