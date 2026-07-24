import React, { useState, useEffect, useRef, useContext } from "react";

import { useHistory, useParams } from "react-router-dom";
import { parseISO } from "date-fns";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import { green, grey, red, blue } from "@material-ui/core/colors";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import Typography from "@material-ui/core/Typography";
import Avatar from "@material-ui/core/Avatar";
import Divider from "@material-ui/core/Divider";
import Badge from "@material-ui/core/Badge";
import Box from "@material-ui/core/Box";

import { i18n } from "../../translate/i18n";
import { formatWhatsappContactName } from "../../helpers/formatWhatsappDisplay";

import api from "../../services/api";
import WhatsMarked from "react-whatsmarked";
import { Tooltip } from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import toastError from "../../errors/toastError";
import { v4 as uuidv4 } from "uuid";

import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import AndroidIcon from "@material-ui/icons/Android";
import VisibilityIcon from "@material-ui/icons/Visibility";
import TicketMessagesDialog from "../TicketMessagesDialog";
import DoneIcon from "@material-ui/icons/Done";
import ReplayIcon from "@material-ui/icons/Replay";
import ClearOutlinedIcon from "@material-ui/icons/ClearOutlined";
import { generateColor } from "../../helpers/colorGenerator";
import { getInitials } from "../../helpers/getInitials";
import pastRelativeDate from "../../helpers/pastRelativeDate";
import TagsLine from "../TagsLine";
import {
  formatWaitingTime,
  getAiTicketBadge,
  getHandoffReasonLabel,
  getPriorityBadge,
  isAiHandlingTicket,
  isHandoffPendingTicket
} from "../../helpers/aiTicketStatus";
import {
  isUserTicketOwner,
  isTicketObservationMode
} from "../../helpers/ticketListVisibility";
import { isMasterAdminUser } from "../../helpers/isMasterAdmin";
import TicketCloseConfirmDialog from "../TicketCloseConfirmDialog";
import { toast } from "react-toastify";

const useStyles = makeStyles(theme => ({
  ticket: {
    position: "relative",
    minHeight: 80,
    paddingHorizontal: 10,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: "flex-start"
  },

  pendingTicket: {
    cursor: "pointer"
  },

  noTicketsDiv: {
    display: "flex",
    height: "100px",
    margin: 40,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  },

  noTicketsText: {
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: "0.875rem",
    lineHeight: "1.4"
  },

  noTicketsTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0px"
  },

  contactNameWrapper: {
    display: "grid",
    justifyContent: "space-between"
  },

  lastMessageTime: {
    textAlign: "right",
    fontSize: 12
  },

  closedBadge: {
    alignSelf: "center",
    justifySelf: "flex-end",
    marginRight: 32,
    marginLeft: "auto"
  },

  contactLastMessage: {},

  newMessagesCount: {
    marginTop: 2
  },

  badgeStyle: {
    color: "white",
    backgroundColor: green[500]
  },

  acceptButton: {
    position: "absolute",
    right: "108px"
  },

  ticketQueueColor: {
    flex: "none",
    width: "8px",
    height: "100%",
    position: "absolute",
    top: "0%",
    left: "0%"
  },

  ticketMetaBadges: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingRight: 72
  },

  ticketContainer: {
    position: "relative",
    isolation: "isolate"
  },

  ticketActionsOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    zIndex: 30,
    pointerEvents: "auto"
  },

  ticketActionsTopRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },

  ticketActions: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },

  actionIcon: {
    color: "#fff",
    cursor: "pointer",
    padding: 4,
    height: 28,
    width: 28,
    fontSize: 14,
    borderRadius: "50%",
    flexShrink: 0,
    position: "relative",
    zIndex: 31,
    boxSizing: "border-box"
  },

  actionDisabled: {
    opacity: 0.45,
    pointerEvents: "none"
  },

  ticketRowButton: {
    position: "relative",
    zIndex: 1
  },

  closeActionIcon: {
    backgroundColor: red[700]
  },

  acceptActionIcon: {
    backgroundColor: green[700]
  },

  spyActionIcon: {
    backgroundColor: blue[700]
  },

  reopenActionIcon: {
    backgroundColor: blue[700]
  },
  Radiusdot: {
    "& .MuiBadge-badge": {
      borderRadius: 2,
      position: "inherit",
      height: 16,
      margin: 2,
      padding: 3,
      fontSize: 10
    },
    "& .MuiBadge-anchorOriginTopRightRectangle": {
      transform: "scale(1) translate(0%, -40%)"
    }
  },
  presence: {
    color: theme.mode === "light" ? "green" : "lightgreen",
    fontWeight: "bold"
  },

  handoffHighlight: {
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(198, 40, 40, 0.15)"
        : "rgba(255, 235, 238, 0.9)",
    borderLeft: "4px solid #c62828"
  },

  aiBadgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2
  }
}));

const TicketListItemCustom = ({ ticket, setTabOpen, groupActionButtons }) => {
  const classes = useStyles();

  const history = useHistory();
  const [ticketUser, setTicketUser] = useState(null);
  const [whatsAppName, setWhatsAppName] = useState(null);

  const [openTicketMessageDialog, setOpenTicketMessageDialog] = useState(false);
  const { ticketId } = useParams();
  const isMounted = useRef(true);
  const {
    setCurrentTicket,
    setObservationMode,
    refreshTicketLists,
    setListSubTab
  } = useContext(TicketsContext);
  const { user } = useContext(AuthContext);
  const { profile } = user;
  const [actionLoading, setActionLoading] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  useEffect(() => {
    if (ticket.userId && ticket.user) {
      setTicketUser(ticket.user.name);
    }

    if (ticket.whatsappId && ticket.whatsapp) {
      setWhatsAppName(ticket.whatsapp.name);
    }

    return () => {
      isMounted.current = false;
    };
  }, [ticket]);

  const handleCloseTicket = async (note = "") => {
    setActionLoading(true);
    try {
      if (note) {
        await api.post("/ticket-notes", {
          note,
          ticketId: ticket.id,
          contactId: ticket.contactId
        });
      }

      await api.put(`/tickets/${ticket.id}`, {
        status: "closed",
        justClose: true,
        userId: ticket.userId || user?.id
      });

      toast.success(i18n.t("ticketsList.closeDialog.success"));
      setCloseDialogOpen(false);
      setObservationMode(false);
      setCurrentTicket({ id: null, code: null, uuid: null });
      refreshTicketLists?.();

      if (String(ticketId) === String(ticket.uuid || ticket.id)) {
        history.push("/tickets");
      }
    } catch (err) {
      toastError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptTicket = async (id, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (actionLoading) {
      return;
    }

    setActionLoading(true);
    try {
      let data;
      if (isHandoffPendingTicket(ticket) || isAiHandlingTicket(ticket)) {
        ({ data } = await api.post(`/tickets/${id}/ai/assume`));
      } else {
        ({ data } = await api.put(`/tickets/${id}`, {
          status: "open",
          userId: user?.id
        }));
      }

      setObservationMode(false);
      setCurrentTicket({
        ...data,
        code: "#open"
      });
      refreshTicketLists?.();
      setListSubTab?.("open");
      toast.success(i18n.t("ticketsList.acceptSuccess"));
      history.push(`/tickets/${data.uuid || data.id || ticket.uuid || id}`, {
        ticketSnapshot: data
      });
      setTabOpen?.("open");
    } catch (err) {
      toastError(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenTicket = async (id, e) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      const { data } = await api.post(`/tickets/${id}/reopen`, {
        releaseToAi: false
      });
      setObservationMode(false);
      const routeId = data.ticket?.uuid || data.ticket?.id || ticket.uuid || id;
      history.push(`/tickets/${routeId}`);
      setTabOpen("open");
    } catch (err) {
      toastError(err);
    }
  };

  const canCloseTicket =
    isMasterAdminUser(user) ||
    profile === "admin" ||
    user?.super ||
    isUserTicketOwner(ticket, user) ||
    (ticket.status === "pending" && !ticket.userId);

  const handleSelectTicket = selected => {
    const code = uuidv4();
    const { id, uuid } = selected;
    const routeId = uuid || String(id);
    const observing = isTicketObservationMode(selected, user);

    setObservationMode(observing);
    setCurrentTicket({ id, uuid: routeId, code });
    history.push(`/tickets/${routeId}`);
  };

  const openCloseDialog = e => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (actionLoading) {
      return;
    }
    setCloseDialogOpen(true);
  };

  const stopCardClick = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  const renderTicketMetaBadges = () => {
    if (ticketUser && ticket.status !== "pending") {
      return (
        <>
          <Badge
            className={classes.Radiusdot}
            badgeContent={`${ticketUser}`}
            style={{
              backgroundColor: "#3498db",
              height: 18,
              padding: 5,
              position: "inherit",
              borderRadius: 7,
              color: "#fff",
              marginRight: 3
            }}
          />

          {ticket.whatsappId && (
            <Badge
              className={classes.Radiusdot}
              badgeContent={`${whatsAppName}`}
              style={{
                backgroundColor: "#7d79f2",
                height: 18,
                padding: 5,
                position: "inherit",
                borderRadius: 7,
                color: "white",
                marginRight: 3
              }}
            />
          )}

          {ticket.queue?.name !== null && (
            <Badge
              className={classes.Radiusdot}
              style={{
                backgroundColor: ticket.queue?.color || "#7C7C7C",
                height: 18,
                padding: 5,
                position: "inherit",
                borderRadius: 7,
                color: "white",
                marginRight: 3
              }}
              badgeContent={ticket.queue?.name || i18n.t("common.noqueue")}
            />
          )}

          {ticket.chatbot && (
            <Tooltip title={i18n.t("ticketsList.tooltips.chatbot")}>
              <AndroidIcon
                fontSize="small"
                style={{ color: grey[700], marginRight: 5 }}
              />
            </Tooltip>
          )}
        </>
      );
    }

    return (
      <>
        {ticket.whatsappId && (
          <Badge
            className={classes.Radiusdot}
            badgeContent={`${whatsAppName}`}
            style={{
              backgroundColor: "#7d79f2",
              height: 18,
              padding: 5,
              position: "inherit",
              borderRadius: 7,
              color: "white",
              marginRight: 3
            }}
          />
        )}

        {ticket.queue?.name !== null && (
          <Badge
            className={classes.Radiusdot}
            style={{
              backgroundColor: ticket.queue?.color || "#7C7C7C",
              height: 18,
              padding: 5,
              paddingHorizontal: 12,
              position: "inherit",
              borderRadius: 7,
              color: "white",
              marginRight: 2
            }}
            badgeContent={ticket.queue?.name || i18n.t("common.noqueue")}
          />
        )}

        {ticket.chatbot && (
          <Tooltip title={i18n.t("ticketsList.tooltips.chatbot")}>
            <AndroidIcon
              fontSize="small"
              style={{ color: grey[700], marginRight: 5 }}
            />
          </Tooltip>
        )}
      </>
    );
  };

  const renderTicketActionButtons = () => {
    const showGroupActions = groupActionButtons || !ticket.isGroup;

    return (
      <>
        {profile === "admin" && showGroupActions && (
          <Tooltip title={i18n.t("ticketsList.tooltips.spyConversation")}>
            <VisibilityIcon
              onMouseDown={stopCardClick}
              onClick={e => {
                e.stopPropagation();
                setOpenTicketMessageDialog(true);
              }}
              fontSize="small"
              className={clsx(classes.actionIcon, classes.spyActionIcon)}
            />
          </Tooltip>
        )}

        {ticket.status === "open" && canCloseTicket && showGroupActions && (
          <Tooltip title={i18n.t("ticketsList.tooltips.closeConversation")}>
            <ClearOutlinedIcon
              onMouseDown={stopCardClick}
              onClick={openCloseDialog}
              fontSize="small"
              className={clsx(classes.actionIcon, classes.closeActionIcon, {
                [classes.actionDisabled]: actionLoading
              })}
            />
          </Tooltip>
        )}

        {ticket.status === "pending" && canCloseTicket && showGroupActions && (
          <Tooltip title={i18n.t("ticketsList.tooltips.closeConversation")}>
            <ClearOutlinedIcon
              onMouseDown={stopCardClick}
              onClick={openCloseDialog}
              fontSize="small"
              className={clsx(classes.actionIcon, classes.closeActionIcon, {
                [classes.actionDisabled]: actionLoading
              })}
            />
          </Tooltip>
        )}

        {ticket.status === "pending" &&
          isHandoffPendingTicket(ticket) &&
          !isAiHandlingTicket(ticket) &&
          showGroupActions && (
            <Tooltip title={i18n.t("ticketsList.tooltips.acceptConversation")}>
              <DoneIcon
                onMouseDown={stopCardClick}
                onClick={e => handleAcceptTicket(ticket.id, e)}
                fontSize="small"
                className={clsx(classes.actionIcon, classes.acceptActionIcon, {
                  [classes.actionDisabled]: actionLoading
                })}
              />
            </Tooltip>
          )}

        {ticket.status === "closed" && showGroupActions && (
          <Tooltip title={i18n.t("messagesList.header.buttons.reopen")}>
            <ReplayIcon
              onMouseDown={stopCardClick}
              onClick={e => handleReopenTicket(ticket.id, e)}
              fontSize="small"
              className={clsx(classes.actionIcon, classes.reopenActionIcon)}
            />
          </Tooltip>
        )}
      </>
    );
  };

  const renderAiBadges = () => {
    const badge = getAiTicketBadge(ticket);
    const priorityBadge = getPriorityBadge(ticket.aiPriority);
    if (!badge && !priorityBadge) return null;

    const waiting = formatWaitingTime(ticket.aiWaitingSince);
    const reasonLabel = getHandoffReasonLabel(ticket.aiHandoffReason);

    return (
      <Box className={classes.aiBadgeRow}>
        {priorityBadge && (
          <Badge
            className={classes.Radiusdot}
            badgeContent={priorityBadge.label}
            style={{
              backgroundColor: priorityBadge.color,
              height: 18,
              padding: 5,
              position: "inherit",
              borderRadius: 7,
              color: "#fff",
              marginRight: 3
            }}
          />
        )}
        {badge && (
          <Badge
            className={classes.Radiusdot}
            badgeContent={badge.label}
            style={{
              backgroundColor: badge.color,
              height: 18,
              padding: 5,
              position: "inherit",
              borderRadius: 7,
              color: "#fff",
              marginRight: 3
            }}
          />
        )}
        {waiting && isHandoffPendingTicket(ticket) && (
          <Badge
            className={classes.Radiusdot}
            badgeContent={`${i18n.t("aiSupervision.waiting")}: ${waiting}`}
            style={{
              backgroundColor: "#b71c1c",
              height: 18,
              padding: 5,
              position: "inherit",
              borderRadius: 7,
              color: "#fff",
              marginRight: 3
            }}
          />
        )}
        {reasonLabel && ticket.aiHandoff && (
          <Badge
            className={classes.Radiusdot}
            badgeContent={reasonLabel}
            style={{
              backgroundColor: "#5d4037",
              height: 18,
              padding: 5,
              position: "inherit",
              borderRadius: 7,
              color: "#fff",
              marginRight: 3
            }}
          />
        )}
      </Box>
    );
  };

  return (
    <div
      key={`ticket-${ticket.id}`}
      className={clsx(classes.ticketContainer, {
        [classes.handoffHighlight]: isHandoffPendingTicket(ticket)
      })}
    >
      <TicketMessagesDialog
        open={openTicketMessageDialog}
        handleClose={() => setOpenTicketMessageDialog(false)}
        ticketId={ticket.id}
      ></TicketMessagesDialog>
      <TicketCloseConfirmDialog
        open={closeDialogOpen}
        ticket={ticket}
        loading={actionLoading}
        onCancel={() => setCloseDialogOpen(false)}
        onConfirm={handleCloseTicket}
      />
      <ListItem
        dense
        button
        onClick={() => {
          handleSelectTicket(ticket);
        }}
        selected={
          ticketId &&
          (ticket.uuid === ticketId || String(ticket.id) === ticketId)
        }
        className={clsx(classes.ticket, classes.ticketRowButton, {
          [classes.pendingTicket]: ticket.status === "pending"
        })}
      >
        <Tooltip
          arrow
          placement="right"
          title={ticket.queue?.name || i18n.t("common.noqueue")}
        >
          <span
            style={{ backgroundColor: ticket.queue?.color || "#7C7C7C" }}
            className={classes.ticketQueueColor}
          ></span>
        </Tooltip>
        <ListItemAvatar>
          <Avatar
            style={{
              backgroundColor: generateColor(ticket?.contact?.number),
              color: "white",
              fontWeight: "bold"
            }}
            src={ticket?.contact?.profilePicUrl}
          >
            {getInitials(ticket?.contact?.name || "")}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          style={{ paddingBottom: 10, paddingRight: 88 }}
          disableTypography
          primary={
            <span className={classes.contactNameWrapper}>
              <Typography
                noWrap
                component="span"
                variant="body2"
                color="textPrimary"
              >
                {ticket.channel === "whatsapp" && (
                  <Tooltip title={`Atribuido à ${ticketUser}`}>
                    <WhatsAppIcon
                      fontSize="inherit"
                      style={{ color: grey[700] }}
                    />
                  </Tooltip>
                )}{" "}
                {formatWhatsappContactName(ticket.contact, ticket)}
              </Typography>
            </span>
          }
          secondary={
            <span className={classes.contactNameWrapper}>
              <Typography
                className={classes.contactLastMessage}
                noWrap
                component="span"
                variant="body2"
                color="textSecondary"
              >
                {["composing", "recording"].includes(ticket?.presence) ? (
                  <span className={classes.presence}>
                    {i18n.t(`presence.${ticket.presence}`)}
                  </span>
                ) : (
                  <>
                    {ticket.lastMessage?.includes("data:image/png;base64") ? (
                      <div>{i18n.t("common.location")}</div>
                    ) : (
                      <WhatsMarked oneline>
                        {ticket.lastMessage.startsWith('{"ticketzvCard"')
                          ? "🪪"
                          : ticket.lastMessage.split("\n")[0]}
                      </WhatsMarked>
                    )}
                  </>
                )}
              </Typography>
              <TagsLine ticket={ticket} />
              {renderAiBadges()}
              <Box className={classes.ticketMetaBadges}>
                {renderTicketMetaBadges()}
              </Box>
            </span>
          }
        />
      </ListItem>
      <Box
        className={classes.ticketActionsOverlay}
        onMouseDown={stopCardClick}
        onClick={stopCardClick}
      >
        <Box className={classes.ticketActionsTopRow}>
          {ticket.lastMessage && (
            <Typography
              className={classes.lastMessageTime}
              component="span"
              variant="body2"
              color="textSecondary"
            >
              {pastRelativeDate(parseISO(ticket.updatedAt))}
            </Typography>
          )}
          <Box className={classes.ticketActions}>
            {renderTicketActionButtons()}
          </Box>
          {ticket.lastMessage && ticket.unreadMessages > 0 && (
            <Badge
              className={classes.newMessagesCount}
              badgeContent={ticket.unreadMessages}
              classes={{
                badge: classes.badgeStyle
              }}
            />
          )}
        </Box>

        {ticket.status === "closed" && (
          <Badge
            className={classes.Radiusdot}
            badgeContent={i18n.t("common.closed")}
            style={{
              backgroundColor: ticket.queue?.color || "#ff0000",
              height: 18,
              padding: 5,
              paddingHorizontal: 12,
              borderRadius: 7,
              color: "white"
            }}
          />
        )}
      </Box>
      <Divider variant="inset" component="li" />
    </div>
  );
};

export default React.memo(TicketListItemCustom);
