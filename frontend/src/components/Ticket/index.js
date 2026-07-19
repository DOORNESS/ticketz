import React, { useState, useEffect, useContext, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";

import { toast } from "react-toastify";
import clsx from "clsx";

import { Paper, makeStyles } from "@material-ui/core";

import ContactDrawer from "../ContactDrawer";
import MessageInput from "../MessageInputCustom/";
import TicketHeader from "../TicketHeader";
import TicketInfo from "../TicketInfo";
import TicketActionButtons from "../TicketActionButtonsCustom";
import MessagesList from "../MessagesList";
import api from "../../services/api";
import { ReplyMessageProvider } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { EditMessageProvider } from "../../context/EditingMessage/EditingMessageContext";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TagsContainer } from "../TagsContainer";
import ClosedTicketBar from "../ClosedTicketBar";
import TicketConversationToolbar from "../TicketConversationToolbar";
import RepositoryPanel from "../RepositoryPanel";
import TicketAdminPanel from "../TicketAdminPanel";
import { SocketContext } from "../../context/Socket/SocketContext";
import useSettings from "../../hooks/useSettings";
import {
  isAiHandlingTicket,
  isHandoffPendingTicket,
  getTicketListColumn
} from "../../helpers/aiTicketStatus";
import { isTicketObservationMode } from "../../helpers/ticketListVisibility";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    height: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: theme.palette.background.paper
  },

  mainWrapper: {
    flex: 1,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeft: "0",
    boxShadow:
      theme.mode === "light" ? "inset 1px 0 0 rgba(15, 23, 42, 0.06)" : "none",
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen
    })
  },

  mainWrapperShift: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen
    }),
    marginRight: 0
  },
  drawerShade: {
    display: "none",
    [theme.breakpoints.down(1400)]: {
      display: "block",
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backdropFilter: "blur(2px)",
      backgroundColor: "rgba(15, 23, 42, 0.35)",
      zIndex: 100
    }
  }
}));

const Ticket = () => {
  const { ticketId } = useParams();
  const history = useHistory();
  const classes = useStyles();

  const { user } = useContext(AuthContext);
  const {
    observationMode,
    setObservationMode,
    setListSubTab,
    setCurrentTicket
  } = useContext(TicketsContext);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState({});
  const [ticket, setTicket] = useState({});
  const [showTabGroups, setShowTabGroups] = useState(false);
  const [tagsMode, setTagsMode] = useState("ticket");
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [repositoryOpen, setRepositoryOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const messageInputRef = useRef(null);
  const { getSetting } = useSettings();

  const socketManager = useContext(SocketContext);

  useEffect(() => {
    Promise.all([getSetting("CheckMsgIsGroup"), getSetting("groupsTab")]).then(
      ([ignoreGroups, groupsTab]) => {
        setShowTabGroups(
          ignoreGroups === "disabled" && groupsTab === "enabled"
        );
      }
    );

    getSetting("tagsMode", "ticket").then(tagsMode => {
      setTagsMode(tagsMode);
    });
  }, []);

  const syncTicketView = updatedTicket => {
    if (!updatedTicket?.id) return;
    setTicket(updatedTicket);
    setObservationMode(isTicketObservationMode(updatedTicket, user));
    setCurrentTicket({
      ...updatedTicket,
      code: updatedTicket.status === "open" ? "#open" : "#pending"
    });
    const column = getTicketListColumn(updatedTicket);
    if (column === "ai" || column === "pending" || column === "open") {
      setListSubTab(column);
    }
  };

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchTicket = async () => {
        try {
          const isUuid =
            ticketId &&
            String(ticketId).includes("-") &&
            !/^\d+$/.test(ticketId);
          const endpoint = isUuid
            ? `/tickets/u/${ticketId}`
            : `/tickets/${ticketId}`;
          const { data } = await api.get(endpoint);
          const { queueId } = data;
          const { queues, profile } = user;

          const isAssignedToUser =
            data.userId && Number(data.userId) === Number(user.id);
          const isHandoffPending = isHandoffPendingTicket(data);

          if (queueId) {
            const queueAllowed = queues.find(q => q.id === queueId);
            if (
              queueAllowed === undefined &&
              profile !== "admin" &&
              !user?.super &&
              !isAssignedToUser &&
              !isHandoffPending
            ) {
              toast.error(i18n.t("common.accessNotAllowed"));
              history.push("/tickets");
              return;
            }
          } else if (
            profile !== "admin" &&
            !user?.super &&
            !isAiHandlingTicket(data) &&
            !isHandoffPendingTicket(data) &&
            !isAssignedToUser &&
            data.status !== "closed"
          ) {
            toast.error(i18n.t("common.accessNotAllowed"));
            history.push("/tickets");
            return;
          }

          setContact(data.contact);
          syncTicketView(data);
          setLoading(false);
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };
      fetchTicket();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [ticketId, user, history, setObservationMode]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");

    const socket = socketManager.GetSocket(companyId);

    const onConnectTicket = () => {
      socket.emit("joinChatBox", `${ticket.id}`);
    };

    socketManager.onConnect(onConnectTicket);

    const onCompanyTicket = data => {
      if (data.action === "update" && data.ticket.id === ticket.id) {
        syncTicketView(data.ticket);
      }

      if (data.action === "delete" && data.ticketId === ticket.id) {
        setObservationMode(false);
        history.push("/tickets");
      }
    };

    const onCompanyContact = data => {
      if (data.action === "update") {
        setContact(prevState => {
          if (prevState.id === data.contact?.id) {
            return { ...prevState, ...data.contact };
          }
          return prevState;
        });
      }
    };

    socket.on(`company-${companyId}-ticket`, onCompanyTicket);
    socket.on(`company-${companyId}-contact`, onCompanyContact);

    return () => {
      socket.disconnect();
    };
  }, [ticketId, ticket, history, socketManager, user, setObservationMode]);

  const isObserving = isTicketObservationMode(ticket, user);

  const handleDrawerOpen = () => {
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
  };

  const renderTicketInfo = () => {
    if (ticket.user !== undefined) {
      return (
        <TicketInfo
          contact={contact}
          ticket={ticket}
          onClick={handleDrawerOpen}
        />
      );
    }
  };

  useEffect(() => {
    window.__ticketzApplySuggestedReply = text => {
      if (messageInputRef.current?.applySuggestedText) {
        messageInputRef.current.applySuggestedText(text);
      }
    };
    return () => {
      delete window.__ticketzApplySuggestedReply;
    };
  }, []);

  const renderMessagesList = () => {
    return (
      <>
        <MessagesList
          ticket={ticket}
          ticketId={ticket.id}
          isGroup={ticket.isGroup}
          markAsRead={!isObserving}
          readOnly={isObserving}
        ></MessagesList>
        <MessageInput
          ref={messageInputRef}
          ticket={ticket}
          showTabGroups
          observationMode={isObserving}
          onOpenRepository={() => setRepositoryOpen(true)}
          onOpenAdminPanel={() => setAdminPanelOpen(true)}
        />
      </>
    );
  };

  return (
    <div className={classes.root} id="drawer-container">
      <Paper
        variant="outlined"
        elevation={0}
        className={clsx(classes.mainWrapper, {
          [classes.mainWrapperShift]: drawerOpen
        })}
      >
        <div
          className={clsx({
            [classes.drawerShade]: drawerOpen
          })}
          onClick={() => setDrawerOpen(false)}
        ></div>
        <TicketHeader loading={loading}>{renderTicketInfo()}</TicketHeader>
        <ClosedTicketBar ticket={ticket} onReopened={syncTicketView} />
        <TicketConversationToolbar
          ticket={ticket}
          observationMode={isObserving}
          user={user}
          tagsExpanded={tagsExpanded}
          onToggleTags={() => setTagsExpanded(prev => !prev)}
          onOpenAdminPanel={() => setAdminPanelOpen(true)}
          onOpenRepository={() => setRepositoryOpen(true)}
        />
        {tagsExpanded && (
          <Paper elevation={0} square>
            <TagsContainer
              ticket={["ticket", "both"].includes(tagsMode) && ticket}
              contact={tagsMode === "contact" && contact}
            />
          </Paper>
        )}
        <ReplyMessageProvider>
          <EditMessageProvider>{renderMessagesList()}</EditMessageProvider>
        </ReplyMessageProvider>
      </Paper>
      <RepositoryPanel
        open={repositoryOpen}
        onClose={() => setRepositoryOpen(false)}
        ticket={ticket}
      />
      <TicketAdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        ticket={ticket}
        user={user}
        observationMode={isObserving}
        onOpenRepository={() => {
          setAdminPanelOpen(false);
          setRepositoryOpen(true);
        }}
        actionButtons={
          <TicketActionButtons
            ticket={ticket}
            showTabGroups={showTabGroups}
            observationMode={isObserving}
            onTicketUpdated={syncTicketView}
          />
        }
      />
      <ContactDrawer
        open={drawerOpen}
        handleDrawerClose={handleDrawerClose}
        contact={contact}
        loading={loading}
        ticket={ticket}
      />
    </div>
  );
};

export default Ticket;
