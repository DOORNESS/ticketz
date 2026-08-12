import React, {
  useState,
  useRef,
  useEffect,
  useContext,
  useCallback
} from "react";
import { useTheme } from "@material-ui/core/styles";

import { useHistory, useLocation } from "react-router-dom";
import { format } from "date-fns";
import useSound from "use-sound";

import Popover from "@material-ui/core/Popover";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import { makeStyles } from "@material-ui/core/styles";
import Badge from "@material-ui/core/Badge";
import ChatIcon from "@material-ui/icons/Chat";
import CloseIcon from "@material-ui/icons/Close";

import TicketListItem from "../TicketListItem";
import { i18n } from "../../translate/i18n";
import useTickets from "../../hooks/useTickets";
import alertSound from "../../assets/sound.mp3";
import { AuthContext } from "../../context/Auth/AuthContext";
import { SocketContext } from "../../context/Socket/SocketContext";
import Favicon from "react-favicon";
import useSettings from "../../hooks/useSettings";
import brandTokens from "../../theme/brandTokens";
import { getHandoffReasonLabel } from "../../helpers/aiTicketStatus";
import {
  isTicketDismissed,
  readDismissals,
  withDismissedTicket,
  withoutDismissedTicket,
  writeDismissals
} from "../../helpers/notificationDismissals";

const MAX_NOTIFICATIONS = 40;

const dedupeNotifications = (items, isViewingTicket, dismissed = {}) => {
  const seen = new Map();
  for (const ticket of items) {
    if (
      !ticket?.id ||
      isViewingTicket(ticket) ||
      isTicketDismissed(dismissed, ticket)
    ) {
      continue;
    }
    seen.set(ticket.id, ticket);
  }
  return Array.from(seen.values()).slice(0, MAX_NOTIFICATIONS);
};

const defaultLogoFavicon = brandTokens.logo.favicon;

const useStyles = makeStyles(theme => ({
  tabContainer: {
    overflowY: "auto",
    maxHeight: 350,
    ...theme.scrollbarStyles
  },
  noShadow: {
    boxShadow: "none !important"
  },
  notificationRow: {
    position: "relative"
  },
  dismissButton: {
    position: "absolute",
    top: 2,
    right: 2,
    zIndex: 1,
    padding: 4,
    color: theme.palette.text.secondary,
    "&:hover": {
      color: theme.palette.text.primary
    }
  }
}));

const NotificationsPopOver = props => {
  const classes = useStyles();
  const theme = useTheme();

  const history = useHistory();
  const { user } = useContext(AuthContext);
  /**
   * `useLocation` e não `history.location`: o objeto de history é mutável e
   * lê-lo no render não assina a mudança de rota. Abrir a conversa precisa
   * re-renderizar aqui, senão a notificação do ticket aberto nunca sai.
   */
  const location = useLocation();
  const routeTicketId = location.pathname.split("/")[2] || "";
  const ticketIdRef = useRef(routeTicketId);
  const anchorEl = useRef();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [soundGroupNotifications, setSoundGroupNotifications] = useState(false);
  const [showTabGroups, setShowTabGroups] = useState(false);
  const { profile, queues, super: isSuperUser } = user || {};
  const isCompanyWideUser = profile === "admin" || isSuperUser === true;
  const safeQueues = queues ?? [];
  const [queueIds, setQueueIds] = useState(safeQueues.map(q => q.id));

  const [, setDesktopNotifications] = useState([]);

  const [dismissed, setDismissed] = useState(() => readDismissals(user?.id));
  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;

  useEffect(() => {
    setDismissed(readDismissals(user?.id));
  }, [user?.id]);

  /**
   * Sem `brandIds`: o sino é deliberadamente **multi-marca**.
   *
   * O seletor do cabeçalho escopa a lista de tickets, não o alerta — quem
   * supervisiona as duas operações precisa saber que chegou mensagem na outra
   * enquanto trabalha nesta. Escopar aqui faria o operador perder mensagem sem
   * nenhum sinal de que ela existe. O recorte que continua valendo é o de
   * autorização: `resolveBrandFilterForQuery` limita às marcas que o usuário
   * pode ver.
   */
  const { tickets, refetch: refetchTickets } = useTickets({
    notClosed: "true",
    withUnreadMessages: "true",
    supervision: isCompanyWideUser || undefined
  });
  const [play] = useSound(alertSound, { volume: props.volume });
  const soundAlertRef = useRef();
  const { getSetting } = useSettings();

  const historyRef = useRef(history);

  const socketManager = useContext(SocketContext);

  const isViewingTicket = ticket => {
    const current = ticketIdRef.current;
    if (!current || !ticket) {
      return false;
    }

    return (
      String(ticket.id) === String(current) ||
      (ticket.uuid && ticket.uuid === current)
    );
  };

  /**
   * Dispensar = tirar do sino e lembrar disso. Sem o registro, o próximo
   * refetch (`unreadMessages > 0`) traria a conversa de volta e o "x" seria
   * enfeite.
   */
  const dismissNotification = useCallback(
    ticket => {
      if (!ticket?.id) {
        return;
      }
      // A gravação fica fora do updater de estado: em StrictMode o updater
      // roda duas vezes e escrever no storage ali seria efeito colateral.
      const next = writeDismissals(
        user?.id,
        withDismissedTicket(dismissedRef.current, ticket)
      );
      dismissedRef.current = next;
      setDismissed(next);
      setNotifications(prev => prev.filter(item => item.id !== ticket.id));
    },
    [user?.id]
  );

  /** Mensagem nova apaga a dispensa: o "x" vale para o que estava na tela. */
  const undismissNotification = useCallback(
    ticketId => {
      const current = dismissedRef.current;
      const cleared = withoutDismissedTicket(current, ticketId);
      if (cleared === current) {
        return;
      }
      const next = writeDismissals(user?.id, cleared);
      dismissedRef.current = next;
      setDismissed(next);
    },
    [user?.id]
  );

  function clearTicket(ticketId) {
    setNotifications(prevState => {
      const ticketIndex = prevState.findIndex(t => t.id === ticketId);
      if (ticketIndex !== -1) {
        prevState.splice(ticketIndex, 1);
        return [...prevState];
      }
      return prevState;
    });

    setDesktopNotifications(prevState => {
      const notfiticationIndex = prevState.findIndex(
        n => n.tag === String(ticketId)
      );
      if (notfiticationIndex !== -1) {
        prevState[notfiticationIndex].close();
        prevState.splice(notfiticationIndex, 1);
        return [...prevState];
      }
      return prevState;
    });
  }

  useEffect(() => {
    getSetting("soundGroupNotifications").then(soundGroupNotifications => {
      setSoundGroupNotifications(soundGroupNotifications === "enabled");
    });

    Promise.all([getSetting("CheckMsgIsGroup"), getSetting("groupsTab")]).then(
      ([ignoreGroups, groupsTab]) => {
        setShowTabGroups(
          ignoreGroups === "disabled" && groupsTab === "enabled"
        );
      }
    );
  }, [getSetting]);

  useEffect(() => {
    soundAlertRef.current = play;

    if ("Notification" in window) {
      Notification.requestPermission();
    }
  }, [play]);

  useEffect(() => {
    setNotifications(
      dedupeNotifications(tickets, isViewingTicket, dismissedRef.current)
    );
  }, [tickets, routeTicketId, dismissed]);

  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  /**
   * Abrir a conversa zera a notificação dela — era o pedido central: o sino
   * repete o que já está na lista ao lado, então não pode sobreviver à leitura.
   */
  useEffect(() => {
    ticketIdRef.current = routeTicketId;

    if (!routeTicketId) {
      return;
    }

    const opened = notificationsRef.current.find(
      t =>
        String(t.id) === String(routeTicketId) ||
        (t.uuid && t.uuid === routeTicketId)
    );

    if (opened) {
      dismissNotification(opened);
      return;
    }

    setNotifications(prevState =>
      dedupeNotifications(prevState, isViewingTicket, dismissedRef.current)
    );
  }, [routeTicketId, dismissNotification]);

  useEffect(() => {
    setQueueIds(safeQueues.map(q => q.id));
  }, [safeQueues]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");
    const socket = socketManager.GetSocket(companyId);

    const onConnectNotificationsPopover = () => {
      socket.emit("joinNotification");
      socket.emit("joinHandoff");
    };

    const onCompanyTicketNotificationsPopover = data => {
      if (data.action === "delete") {
        clearTicket(data.ticketId);
        return;
      }

      if (data.action === "updateUnread") {
        clearTicket(data.ticketId);
        return;
      }

      if (data.action === "update" && data.ticket) {
        setNotifications(prevState => {
          const ticketIndex = prevState.findIndex(t => t.id === data.ticket.id);

          if (data.ticket.status === "closed" && !data.ticket.unreadMessages) {
            if (ticketIndex === -1) {
              return prevState;
            }
            return dedupeNotifications(
              prevState.filter(t => t.id !== data.ticket.id),
              isViewingTicket,
              dismissedRef.current
            );
          }

          let next;
          if (ticketIndex !== -1) {
            next = [...prevState];
            next[ticketIndex] = data.ticket;
          } else if (data.ticket.unreadMessages > 0) {
            next = [data.ticket, ...prevState];
          } else {
            return prevState;
          }

          return dedupeNotifications(
            next,
            isViewingTicket,
            dismissedRef.current
          );
        });
      }
    };

    const onCompanyAppMessageNotificationsPopover = data => {
      if (data.suppressHumanAlert) {
        return;
      }

      if (
        data.action === "create" &&
        !data.message.read &&
        (data.ticket.userId === user?.id ||
          (!data.ticket.userId &&
            (queueIds.includes(data.ticket.queueId) ||
              (!data.ticket.queueId && isCompanyWideUser))))
      ) {
        if (
          isViewingTicket(data.ticket) &&
          document.visibilityState === "visible"
        ) {
          return;
        }

        // Mensagem nova reabre a notificação mesmo que o ticket tenha sido
        // dispensado antes — o "x" fecha o que estava ali, não silencia a
        // conversa para sempre.
        undismissNotification(data.ticket.id);

        setNotifications(prevState => {
          const ticketIndex = prevState.findIndex(t => t.id === data.ticket.id);
          let next;
          if (ticketIndex !== -1) {
            next = [...prevState];
            next[ticketIndex] = data.ticket;
          } else {
            next = [data.ticket, ...prevState];
          }
          return dedupeNotifications(
            next,
            isViewingTicket,
            withoutDismissedTicket(dismissedRef.current, data.ticket.id)
          );
        });

        const shouldNotNotificate =
          (isViewingTicket(data.ticket) &&
            document.visibilityState === "visible") ||
          (data.ticket.userId && data.ticket.userId !== user?.id) ||
          (data.ticket.isGroup && !soundGroupNotifications);

        if (shouldNotNotificate) return;

        handleNotifications(data);
      }
    };

    const onCompanyHandoffNotificationsPopover = data => {
      if (data.action !== "handoff_alert" || !data.ticket) {
        return;
      }

      const ticket = data.ticket;
      const belongsToQueue =
        isCompanyWideUser ||
        queueIds.includes(ticket.queueId) ||
        !ticket.queueId;

      if (!belongsToQueue) {
        return;
      }

      if (isViewingTicket(ticket) && document.visibilityState === "visible") {
        return;
      }

      // Handoff é alerta novo: passa por cima de dispensa anterior.
      undismissNotification(ticket.id);

      setNotifications(prevState => {
        const ticketIndex = prevState.findIndex(t => t.id === ticket.id);
        let next;
        if (ticketIndex !== -1) {
          next = [...prevState];
          next[ticketIndex] = ticket;
        } else {
          next = [ticket, ...prevState];
        }
        return dedupeNotifications(
          next,
          isViewingTicket,
          withoutDismissedTicket(dismissedRef.current, ticket.id)
        );
      });

      const reasonLabel =
        data.reasonLabel ||
        getHandoffReasonLabel(data.reason || ticket.aiHandoffReason);

      const shouldNotNotificate =
        isViewingTicket(ticket) && document.visibilityState === "visible";

      if (shouldNotNotificate) return;

      handleHandoffNotification(ticket, reasonLabel);
    };

    const onCompanyContactNotificationsPopover = data => {
      if (data.action !== "update") {
        return;
      }

      setNotifications(prevState =>
        prevState.map(ticket =>
          ticket.contactId === data.contact?.id
            ? { ...ticket, contact: { ...ticket.contact, ...data.contact } }
            : ticket
        )
      );
    };

    socketManager.onConnect(onConnectNotificationsPopover);
    socket.on(
      `company-${companyId}-ticket`,
      onCompanyTicketNotificationsPopover
    );
    socket.on(
      `company-${companyId}-appMessage`,
      onCompanyAppMessageNotificationsPopover
    );
    socket.on(
      `company-${companyId}-contact`,
      onCompanyContactNotificationsPopover
    );
    socket.on(
      `company-${companyId}-handoff`,
      onCompanyHandoffNotificationsPopover
    );
    socket.on("wsRefreshRequired", refreshRequired => {
      if (refreshRequired) {
        refetchTickets();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [
    user,
    profile,
    queues,
    queueIds,
    soundGroupNotifications,
    socketManager,
    refetchTickets,
    undismissNotification
  ]);

  const handleNotifications = data => {
    const { message, contact, ticket } = data;

    const body = message.body.startsWith('{"ticketzvCard"')
      ? "🪪"
      : message.body;

    const options = {
      body: `${format(new Date(), "HH:mm")}\n${body}`,
      icon: contact.profilePicUrl,
      tag: ticket.id,
      renotify: true
    };

    try {
      const notification = new Notification(
        `${i18n.t("tickets.notification.message")} ${contact.name}`,
        options
      );

      notification.onclick = e => {
        e.preventDefault();
        window.focus();
        historyRef.current.push(`/tickets/${ticket.uuid}`);
      };

      setDesktopNotifications(prevState => {
        const notfiticationIndex = prevState.findIndex(
          n => n.tag === notification.tag
        );
        if (notfiticationIndex !== -1) {
          prevState[notfiticationIndex] = notification;
          return [...prevState];
        }
        return [notification, ...prevState];
      });
    } catch (e) {
      console.error("Failed to push browser notification");
    }

    soundAlertRef.current();
  };

  const handleHandoffNotification = (ticket, reasonLabel) => {
    const queueName = ticket.queue?.name || i18n.t("common.noqueue");
    const options = {
      body: `${i18n.t("aiSupervision.handoffAlert.body")}\n${i18n.t(
        "aiSupervision.handoffAlert.queue"
      )}: ${queueName}\n${i18n.t("aiSupervision.handoffAlert.reason")}: ${
        reasonLabel || "—"
      }`,
      icon: ticket.contact?.profilePicUrl,
      tag: `handoff-${ticket.id}`,
      renotify: true
    };

    try {
      const notification = new Notification(
        i18n.t("aiSupervision.handoffAlert.title"),
        options
      );

      notification.onclick = e => {
        e.preventDefault();
        window.focus();
        historyRef.current.push(`/tickets/${ticket.uuid}`);
      };

      setDesktopNotifications(prevState => {
        const notfiticationIndex = prevState.findIndex(
          n => n.tag === notification.tag
        );
        if (notfiticationIndex !== -1) {
          prevState[notfiticationIndex] = notification;
          return [...prevState];
        }
        return [notification, ...prevState];
      });
    } catch (e) {
      console.error("Failed to push handoff browser notification");
    }

    soundAlertRef.current();
  };

  const handleClick = () => {
    setIsOpen(prevState => !prevState);
  };

  const handleClickAway = () => {
    setIsOpen(false);
  };

  const NotificationTicket = ({ children }) => {
    return <div onClick={handleClickAway}>{children}</div>;
  };

  useEffect(() => {
    const numbers = "⓿➊➋➌➍➎➏➐➑➒➓⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴";
    const pageTitle = brandTokens.appTitle;
    const count = notifications.length;
    if (count > 0) {
      document.title =
        count < 21
          ? numbers.substring(count, count + 1) + " - " + pageTitle
          : "(" + count + ")" + pageTitle;
    } else {
      document.title = pageTitle;
    }
  }, [notifications.length]);

  return (
    <>
      <Favicon
        animated={false}
        url={theme?.appLogoFavicon ? theme.appLogoFavicon : defaultLogoFavicon}
        alertCount={Math.min(notifications.length, 99)}
        iconSize={195}
      />
      <IconButton
        onClick={handleClick}
        ref={anchorEl}
        aria-label="Mostrar Notificações"
        variant="contained"
      >
        <ChatIcon style={{ color: theme.palette.primary.contrastText }} />
        {notifications.length > 0 ? (
          <Badge
            badgeContent={Math.min(notifications.length, 99)}
            color="secondary"
            style={{ marginTop: "-25px", marginLeft: 8 }}
          />
        ) : null}
      </IconButton>
      <Popover
        disableScrollLock
        open={isOpen}
        anchorEl={anchorEl.current}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        classes={{ paper: classes.popoverPaper }}
        onClose={handleClickAway}
      >
        <List dense className={classes.tabContainer}>
          {notifications.length === 0 ? (
            <ListItem>
              <ListItemText>{i18n.t("notifications.noTickets")}</ListItemText>
            </ListItem>
          ) : (
            notifications.map(ticket => (
              <div key={ticket.id} className={classes.notificationRow}>
                <IconButton
                  size="small"
                  className={classes.dismissButton}
                  aria-label={i18n.t("notifications.dismiss")}
                  title={i18n.t("notifications.dismiss")}
                  onClick={event => {
                    // O clique não pode subir para o item: dispensar é o
                    // oposto de abrir a conversa.
                    event.stopPropagation();
                    event.preventDefault();
                    dismissNotification(ticket);
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
                <NotificationTicket>
                  <TicketListItem
                    ticket={ticket}
                    groupActionButtons={!showTabGroups}
                  />
                </NotificationTicket>
              </div>
            ))
          )}
        </List>
      </Popover>
    </>
  );
};

export default NotificationsPopOver;
