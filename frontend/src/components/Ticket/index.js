import React, { useState, useEffect, useContext, useRef } from "react";
import { useParams, useHistory, useLocation } from "react-router-dom";

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
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { TagsContainer } from "../TagsContainer";
import ClosedTicketBar from "../ClosedTicketBar";
import TicketConversationToolbar from "../TicketConversationToolbar";
import RepositoryPanel from "../RepositoryPanel";
import TicketAdminPanel from "../TicketAdminPanel";
import AiSuggestAnnexDialog from "../AiSuggestAnnexDialog";
import { SocketContext } from "../../context/Socket/SocketContext";
import useSettings from "../../hooks/useSettings";
import {
  getTicketListColumn,
  isAiHandlingTicket
} from "../../helpers/aiTicketStatus";
import { isTicketObservationMode } from "../../helpers/ticketListVisibility";
import { TicketsContext } from "../../context/Tickets/TicketsContext";

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
  const location = useLocation();
  const classes = useStyles();

  const { user, loading: authLoading } = useContext(AuthContext);
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
  const [supervisionParticipating, setSupervisionParticipating] =
    useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [annexDialogOpen, setAnnexDialogOpen] = useState(false);
  const [annexSuggestedText, setAnnexSuggestedText] = useState("");
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

    setTicket(prev => {
      if (
        prev?.id === updatedTicket.id &&
        prev?.userId === updatedTicket.userId &&
        prev?.status === updatedTicket.status &&
        prev?.updatedAt === updatedTicket.updatedAt &&
        prev?.aiProcessingState === updatedTicket.aiProcessingState &&
        prev?.aiPaused === updatedTicket.aiPaused &&
        prev?.aiAgentId === updatedTicket.aiAgentId
      ) {
        return prev;
      }
      return updatedTicket;
    });

    setObservationMode(isTicketObservationMode(updatedTicket, user));

    const code = updatedTicket.status === "open" ? "#open" : "#pending";
    setCurrentTicket(prev => {
      if (
        prev?.id === updatedTicket.id &&
        prev?.userId === updatedTicket.userId &&
        prev?.status === updatedTicket.status &&
        prev?.code === code
      ) {
        return prev;
      }
      return { ...updatedTicket, code };
    });

    const column = getTicketListColumn(updatedTicket);
    if (column === "ai" || column === "pending" || column === "open") {
      setListSubTab(column);
    }
  };

  useEffect(() => {
    if (authLoading || !user?.id) {
      return undefined;
    }

    if (location.state?.ticketSnapshot) {
      syncTicketView(location.state.ticketSnapshot);
      setLoading(false);
      history.replace({
        pathname: location.pathname,
        search: location.search,
        state: {}
      });
      return undefined;
    }

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
          setContact(data.contact);
          syncTicketView(data);
          setLoading(false);
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };
      fetchTicket();
    }, 150);
    return () => clearTimeout(delayDebounceFn);
  }, [ticketId, user, authLoading, history, setObservationMode]);

  useEffect(() => {
    if (!ticket.id) {
      return undefined;
    }

    const companyId = localStorage.getItem("companyId");

    const socket = socketManager.GetSocket(companyId);

    const onConnectTicket = () => {
      socket.emit("joinChatBox", `${ticket.id}`);
    };

    socketManager.onConnect(onConnectTicket);
    onConnectTicket();

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
      socket.off(`company-${companyId}-ticket`, onCompanyTicket);
      socket.off(`company-${companyId}-contact`, onCompanyContact);
      socket.emit("leaveChatBox", `${ticket.id}`);
    };
  }, [ticketId, history, socketManager, user, setObservationMode]);

  useEffect(() => {
    if (!ticket?.id || !isAiHandlingTicket(ticket)) {
      return undefined;
    }

    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/tickets/${ticket.id}`);
        syncTicketView(data);
      } catch (_) {
        /* ignore transient poll errors */
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [ticket?.id, ticket?.aiAgentId, ticket?.aiPaused, ticket?.userId]);

  useEffect(() => {
    if (!ticket?.aiAgentId || ticket?.userId || ticket?.status === "closed") {
      setSupervisionParticipating(false);
    }
  }, [ticket?.id, ticket?.aiAgentId, ticket?.userId, ticket?.status]);

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

  const handleStopParticipating = async () => {
    setSupervisionParticipating(false);
    if (ticket?.aiPaused) {
      await handleResumeAi();
    }
  };

  const handleResumeAi = async () => {
    if (!ticket?.id) return;
    setResumeLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/ai/resume`);
      syncTicketView(data);
      setSupervisionParticipating(false);
      toast.success("IA retomada — o robô vai responder novamente.");
    } catch (err) {
      toastError(err);
    } finally {
      setResumeLoading(false);
    }
  };

  const handleSuggestResponse = async () => {
    if (!ticket?.id) return;
    setSuggestLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/ai/copilot`, {
        instruction:
          "Analise a conversa e sugira a melhor resposta para o cliente agora. Seja claro, objetivo e use a base de conhecimento quando possível.",
        refresh: true
      });
      const text = data?.suggestion?.suggestedResponse;
      if (!text) {
        toast.error(
          "Não foi possível gerar sugestão da IA. Tente novamente em instantes."
        );
        return;
      }
      setAnnexSuggestedText(text);
      setAnnexDialogOpen(true);
    } catch (err) {
      toastError(err);
    } finally {
      setSuggestLoading(false);
    }
  };

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
          supervisionParticipating={supervisionParticipating}
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
          supervisionParticipating={supervisionParticipating}
          onParticipate={() => setSupervisionParticipating(true)}
          onStopParticipating={handleStopParticipating}
          onResumeAi={handleResumeAi}
          onSuggestResponse={handleSuggestResponse}
          suggestLoading={suggestLoading}
          resumeLoading={resumeLoading}
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
      <AiSuggestAnnexDialog
        open={annexDialogOpen}
        onClose={() => setAnnexDialogOpen(false)}
        ticketId={ticket.id}
        suggestedText={annexSuggestedText}
        onApplyToInput={text => {
          if (!supervisionParticipating) {
            setSupervisionParticipating(true);
          }
          if (messageInputRef.current?.applySuggestedText) {
            messageInputRef.current.applySuggestedText(text);
          }
        }}
      />
    </div>
  );
};

export default Ticket;
